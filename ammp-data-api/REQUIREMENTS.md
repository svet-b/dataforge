Integrate with the API at https://data-api.ammp.io/. See https://data-api.ammp.io/docs and https://data-api.ammp.io/openapi.json for schema (also stored in this directory). 

## Authentication

Use long-lived API key from env var AMMP_DATA_API_KEY set in .env in order to make call to /v1/token endpoint; this provides a JWT with 1-hour validity that should be used as bearer token for all other requests.

## Data endpoints

Initially only integrate with the following two data endpoints:
- /v1/assets/{asset_id}/historic-energy
- /v1/assets/{asset_id}/commercial-kpis/financial-impact
See @samples subdirectory for full data samples.

## Parameterization
- The asset_id should be set as a workflow parameter.
  - Optional: It may be setable based on the asset name (mapped via /v1/assets endpoint).
- The date_from and date_to should be workflow parameters
- Interval should be a workflow parameter (defaults to 1h if not set)
