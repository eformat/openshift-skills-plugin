# Administration

<span class="badge">Topics: RBAC, Multi-Tenancy, Deployment</span>

---

## RBAC and Multi-Tenancy

The plugin implements per-user data ownership and role-based access control using OpenShift RBAC primitives.

### User Roles

Two ClusterRoles are deployed with the Helm chart:

| ClusterRole | Verbs | Purpose |
|-------------|-------|---------|
| `skills-plugin-user` | `use` | Basic plugin access |
| `skills-plugin-admin` | `use`, `admin` | Full admin access |

Bind roles to users with:

```bash
oc adm policy add-cluster-role-to-user skills-plugin-user <username>
oc adm policy add-cluster-role-to-user skills-plugin-admin <username>
```

### Ownership Model

Every resource (sessions, tasks, skills, endpoints) has an `owner` field set at creation time. The ownership rules are:

| Resource | Non-Admin Visibility | Admin Visibility |
|----------|---------------------|-----------------|
| **Chat Sessions** | Own sessions only | All sessions |
| **Scheduled Tasks** | Own tasks only | All tasks |
| **Skills** | Own + Global | All skills |
| **MaaS Endpoints** | Own + Global | All endpoints |

### Global Resources

Skills and MaaS endpoints can be shared globally via the **Share globally** toggle. Global resources are readable by all users but only editable by the owner or admins.

---

## Admin-Only Features

| Feature | Location |
|---------|----------|
| Edit system prompt | Settings page |
| Export database | Settings page |
| Import database | Settings page |
| View all users' sessions | Chat page |
| View all users' tasks | Schedule page |
| Edit/delete any resource | All pages |

---

## Deployment

### Basic Install

```bash
helm upgrade --install skills-plugin chart/ -n skills-plugin --create-namespace
```

### With MLflow Observability

```bash
COOKIE=$(openssl rand -base64 32)
helm upgrade --install skills-plugin chart/ -n skills-plugin --create-namespace \
  --set mlflow.enabled=true \
  --set mlflow.oauth.cookieSecret=$COOKIE
```

### Key Helm Values

| Value | Default | Description |
|-------|---------|-------------|
| `plugin.image` | `quay.io/eformat/openshift-skills-plugin:latest` | Plugin container image |
| `plugin.pvc.size` | `2Gi` | PVC size for SQLite data |
| `mlflow.enabled` | `false` | Enable MLflow tracing |
| `mlflow.oauth.enabled` | `false` | Enable OAuth proxy for MLflow |

---

## MLflow Tracing

When MLflow is enabled, all agent loop executions (chat and scheduled tasks) are traced via OpenTelemetry:

- **AGENT** span (root) per agent invocation
- **CHAT_MODEL** span per LLM API call
- **TOOL** span per shell command execution

Each chat session maps to a separate MLflow experiment. Scheduled tasks use `"Scheduled: " + task name`.

---

## Next Steps

- [Settings](settings) -- configure endpoints and system prompt
- [FAQ](faq) -- common questions and troubleshooting
