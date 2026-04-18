# FAQ

<span class="badge">Topics: Troubleshooting, Common Questions</span>

---

## General

### What models are supported?

The plugin works with any OpenAI-compatible model serving endpoint. It uses the standard `/v1/chat/completions` API with tool calling support. Models must support the `tools` parameter for the agent loop to function.

### What is a "skill"?

A skill is a markdown knowledge file (SKILLS.md) that gets appended to the system prompt. It provides domain-specific instructions and context to guide the AI agent's behavior for specific tasks.

### Can I use the plugin without a container image for scheduled tasks?

Yes. When no container image is specified, the agent runs commands directly in the plugin pod's shell. This is simpler but means all tasks share the plugin pod's ServiceAccount permissions.

---

## Chat

### Why does the agent say it can't access the cluster?

Check that:
1. A MaaS endpoint is configured and healthy in Settings
2. The plugin pod's ServiceAccount has the necessary RBAC permissions
3. The selected model supports tool calling

### How many tool calls can the agent make per message?

The agent loop allows up to **15 iterations** per message. Each iteration can include one or more tool calls. If the agent hits the limit, it returns the best response it has so far.

### What happens to `<think>` tags in responses?

The agent automatically strips `<think>` tags from responses. These are sometimes produced by reasoning models and would otherwise clutter the output.

---

## Scheduled Tasks

### What happens if a cron job fires while the previous run is still active?

The new run is **skipped**. A concurrency guard prevents the same task from executing simultaneously.

### Where do scheduled task results go?

Results are stored as chat sessions. Each task creates or reuses a chat session, and you can view the full agent conversation in the **Chat** page.

### What if I delete the chat session linked to a scheduled task?

The task will automatically create a new session on its next run. The `getOrCreateSession()` function validates the session still exists before reusing it.

---

## Settings

### Why can't I edit the system prompt?

The custom system prompt is admin-only. You need the `skills-plugin-admin` ClusterRole bound to your user.

### What does "Configured" mean for API keys?

It means an API key has been set for the endpoint. API keys are never returned to the frontend for security -- the UI only shows whether one is configured or not.

### Can I migrate settings between clusters?

Yes. Use **Export Database** on the source cluster and **Import Database** on the target cluster (both in Settings). This transfers all skills, sessions, scheduled tasks, endpoints, and configuration.

<div class="alert alert-warning">After importing a database, all scheduled tasks are automatically reloaded with their original cron schedules.</div>

---

## RBAC

### How is admin access determined?

The plugin performs a SubjectAccessReview against the virtual resource `skills.openshift.io/plugins` with verb `admin`. No CRD is needed -- SAR works against RBAC rules for unregistered API groups.

### What happens in dev mode without a kube client?

When no in-cluster config is available (local development), all requests are treated as anonymous admin with no auth enforcement. This is a dev-mode convenience only.

---

## Next Steps

- [Getting Started](getting-started) -- initial setup
- [Administration](admin) -- deployment and RBAC configuration
