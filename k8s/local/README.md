# Local Overlay

This overlay includes local Redis and TimescaleDB/Postgres workloads plus
placeholder secrets.

Before applying, edit `secrets.example.yaml` and set:

- `RIOT_API_KEY`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `FLOWER_USER`
- `FLOWER_PASSWORD`

Then run from the repository root:

```bash
kubectl apply -k k8s/local
```
