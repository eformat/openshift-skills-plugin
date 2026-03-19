package mlflow

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

var (
	mlflowBaseURL string
	mlflowHost    string
	enabled       bool
	otelResource  *resource.Resource

	// Per-experiment tracer cache: each experiment gets its own TracerProvider
	// with an OTLP exporter configured for that experiment's ID.
	tracersMu sync.Mutex
	tracers   = map[string]trace.Tracer{}
	providers = map[string]*sdktrace.TracerProvider{}
)

// Init validates connectivity to MLflow. Per-experiment tracers are created lazily.
func Init(mlflowURL string) {
	if mlflowURL == "" {
		mlflowURL = os.Getenv("MLFLOW_TRACKING_URI")
	}
	if mlflowURL == "" {
		log.Println("MLflow tracing not configured (set MLFLOW_TRACKING_URI or enable mlflow in chart)")
		return
	}
	mlflowURL = strings.TrimRight(mlflowURL, "/")

	u, err := url.Parse(mlflowURL)
	if err != nil {
		log.Printf("MLflow: invalid URL %q: %v (tracing disabled)", mlflowURL, err)
		return
	}

	// Verify connectivity by hitting the health endpoint
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(mlflowURL + "/health")
	if err != nil {
		log.Printf("MLflow: cannot reach %s: %v (tracing disabled)", mlflowURL, err)
		return
	}
	resp.Body.Close()

	mlflowBaseURL = mlflowURL
	mlflowHost = u.Host
	enabled = true
	otelResource = resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceNameKey.String("openshift-skills-plugin"),
	)

	log.Printf("MLflow tracing enabled: %s", mlflowURL)
}

// getTracerForExperiment returns a tracer that sends spans to the given MLflow experiment.
// Experiments and their tracer providers are created lazily and cached.
func getTracerForExperiment(experimentName string) trace.Tracer {
	if !enabled {
		return otel.Tracer("openshift-skills-plugin")
	}

	tracersMu.Lock()
	defer tracersMu.Unlock()

	if t, ok := tracers[experimentName]; ok {
		return t
	}

	// Create or look up the experiment via v2 API
	experimentID, err := getOrCreateExperiment(mlflowBaseURL, experimentName)
	if err != nil {
		log.Printf("MLflow: failed to get/create experiment %q: %v", experimentName, err)
		return otel.Tracer("openshift-skills-plugin")
	}

	// Create a dedicated OTLP exporter with this experiment's header
	exporter, err := otlptracehttp.New(context.Background(),
		otlptracehttp.WithEndpoint(mlflowHost),
		otlptracehttp.WithInsecure(),
		otlptracehttp.WithHeaders(map[string]string{
			"x-mlflow-experiment-id": experimentID,
		}),
	)
	if err != nil {
		log.Printf("MLflow: failed to create exporter for experiment %q: %v", experimentName, err)
		return otel.Tracer("openshift-skills-plugin")
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(otelResource),
	)

	t := tp.Tracer("openshift-skills-plugin")
	tracers[experimentName] = t
	providers[experimentName] = tp
	log.Printf("MLflow: created tracer for experiment %q (id: %s)", experimentName, experimentID)
	return t
}

// Span attribute keys used by MLflow
const (
	SpanTypeKey    = "mlflow.spanType"
	SpanInputsKey  = "mlflow.spanInputs"
	SpanOutputsKey = "mlflow.spanOutputs"
)

// StartAgentSpan creates the root AGENT span for an agent loop execution.
// The experimentName determines which MLflow experiment traces are stored in.
func StartAgentSpan(ctx context.Context, experimentName, model, source, userMessage string, temperature float64, maxTokens int) (context.Context, trace.Span) {
	t := getTracerForExperiment(experimentName)
	ctx, span := t.Start(ctx, "agent-loop",
		trace.WithAttributes(
			attribute.String(SpanTypeKey, "AGENT"),
			attribute.String("ai.model.name", model),
			attribute.Float64("ai.model.temperature", temperature),
			attribute.Int("ai.model.max_tokens", maxTokens),
			attribute.String("source", source),
			attribute.String("experiment", experimentName),
			attribute.String(SpanInputsKey, truncate(userMessage, 5000)),
		),
	)
	return ctx, span
}

// StartLLMSpan creates a CHAT_MODEL span for a single LLM API call.
func StartLLMSpan(ctx context.Context, model string, iteration int) (context.Context, trace.Span) {
	// Child spans inherit the tracer from the parent context automatically
	t := trace.SpanFromContext(ctx).TracerProvider().Tracer("openshift-skills-plugin")
	ctx, span := t.Start(ctx, fmt.Sprintf("llm-call-%d", iteration+1),
		trace.WithAttributes(
			attribute.String(SpanTypeKey, "CHAT_MODEL"),
			attribute.String("ai.model.name", model),
			attribute.Int("iteration", iteration+1),
		),
	)
	return ctx, span
}

// StartToolSpan creates a TOOL span for a tool execution.
func StartToolSpan(ctx context.Context, toolName, arguments string) (context.Context, trace.Span) {
	t := trace.SpanFromContext(ctx).TracerProvider().Tracer("openshift-skills-plugin")
	ctx, span := t.Start(ctx, "tool: "+toolName,
		trace.WithAttributes(
			attribute.String(SpanTypeKey, "TOOL"),
			attribute.String("tool.name", toolName),
			attribute.String(SpanInputsKey, truncate(arguments, 5000)),
		),
	)
	return ctx, span
}

// EndSpanOK ends a span with success status and optional output.
func EndSpanOK(span trace.Span, output string) {
	if output != "" {
		span.SetAttributes(attribute.String(SpanOutputsKey, truncate(output, 5000)))
	}
	span.End()
}

// EndSpanError ends a span with error status.
func EndSpanError(span trace.Span, err error) {
	span.RecordError(err)
	span.SetAttributes(attribute.String("error.message", err.Error()))
	span.End()
}

// Shutdown flushes all pending traces across all experiment tracers.
func Shutdown(ctx context.Context) {
	tracersMu.Lock()
	defer tracersMu.Unlock()
	for name, tp := range providers {
		if err := tp.Shutdown(ctx); err != nil {
			log.Printf("MLflow: error shutting down tracer for %q: %v", name, err)
		}
	}
}

// --- MLflow v2 API for experiment management ---

func getOrCreateExperiment(mlflowURL, name string) (string, error) {
	client := &http.Client{Timeout: 10 * time.Second}

	// Try to get by name
	req, err := http.NewRequest("GET", fmt.Sprintf("%s/api/2.0/mlflow/experiments/get-by-name?experiment_name=%s", mlflowURL, url.QueryEscape(name)), nil)
	if err == nil {
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var result struct {
					Experiment struct {
						ExperimentID string `json:"experiment_id"`
					} `json:"experiment"`
				}
				if json.NewDecoder(resp.Body).Decode(&result) == nil && result.Experiment.ExperimentID != "" {
					return result.Experiment.ExperimentID, nil
				}
			}
		}
	}

	// Create new
	body, _ := json.Marshal(map[string]string{"name": name})
	req, err = http.NewRequest("POST", mlflowURL+"/api/2.0/mlflow/experiments/create", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("create experiment: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		ExperimentID string `json:"experiment_id"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}
	return result.ExperimentID, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
