# Farsight Analytics Case Study

## Project Summary

Farsight Analytics is a full-stack League of Legends intelligence platform focused on player decision-making, not just box-score stats. It combines FastAPI, Next.js, PostgreSQL, TimescaleDB, Redis, Celery, and scikit-learn/XGBoost to turn Riot match and timeline data into profile pages, matchup analytics, gold-curve insights, draft prediction, and tilt detection.

Live project:
- Frontend: https://farsight-gg.vercel.app
- API docs: https://farsight-production.up.railway.app/docs

## The Problem

Most public stat sites do a good job showing the obvious things:

- KDA
- win rate
- rank
- champion pool

But they usually stop at surface-level summaries. They rarely answer deeper questions such as:

- How did a game actually open up minute by minute?
- Was this player converting gold into damage and objective pressure?
- Which roles and matchups are driving current form?
- Is a losing streak random variance, or does it show actual performance decay?
- How much does a draft favor the blue side before the game even starts?

I wanted to build a system that treated a player profile less like a match-history page and more like an analytics product.

## The Solution

Farsight ingests Riot match and timeline data into a relational plus time-series stack, then layers machine learning and custom visualizations on top of it.

The product centers on four ideas:

1. `Tracked profiles, not just lookups`
Players can be onboarded into the local dataset and refreshed asynchronously through background workers.

2. `Timeline-aware analysis`
Gold-diff charts, frame-based economy reads, and pressure summaries are built from minute-level timeline storage rather than just post-game aggregates.

3. `Explainable ML`
Tilt detection and draft prediction go beyond static rules. The tilt model uses SHAP-based reasoning to explain why the model thinks a player may be entering a tilt state.

4. `Production-minded ingestion`
The system is built around Riot rate limits, background queues, cache layers, and deployment constraints rather than assuming ideal local conditions.

## Key Technical Challenges

### 1. Riot API rate limiting

Riot APIs are tightly rate-limited, which makes naive fanout unsafe. The ingestion pipeline had to queue work in Celery and apply Redis-backed rate limiting so the app could onboard or refresh tracked summoners without bursting past API quotas.

### 2. Time-series joins on match timelines

The match timeline data is where a lot of the interesting product value lives, but it is also the hardest data to query efficiently. Farsight uses TimescaleDB hypertables for `match_timeline_frames` so minute-level views stay workable even as the tracked corpus grows.

### 3. Turning model output into something a player can use

It is not enough to say "tilt score = 0.81." The product needed a translation layer from feature values to readable reasons. That led to a SHAP-backed explanation path so the UI can surface plain-English reasons instead of opaque probabilities.

### 4. Production deployment with ML artifacts

Inference relies on serialized model artifacts and feature lists. Making those artifacts deploy cleanly, fail safely, and stay optional where appropriate became part of the engineering work rather than an afterthought.

### 5. Handling "not found" and partial-data states gracefully

A dashboard with async onboarding and optional ML artifacts has many non-happy paths. I had to make sure missing summoners, incomplete profile tracking, unavailable models, and backend refresh lag all degrade into understandable UI states instead of raw 404s or opaque errors.

## Architecture

High-level stack:

- `Frontend`: Next.js 16, TypeScript, Tailwind CSS, React Query
- `API`: FastAPI
- `Background jobs`: Celery + Redis
- `Database`: PostgreSQL + TimescaleDB
- `ML`: scikit-learn, XGBoost, pandas, SHAP
- `Deploy`: Vercel for frontend, Railway for backend services

Blueprint:
- [lol_dashboard_blueprint.html](blueprints/lol_dashboard_blueprint.html)

## Results

Recent local pipeline outputs produced:

- `91,470` participant records exported from `9,147` matches
- `18,294` draft training rows with `0` missing values
- `172` unique champions represented in the source data
- `32,082` tilt training rows built from `1,668` eligible summoners

These numbers matter because they show the project is operating on a non-trivial match corpus rather than toy examples.

## What I’m Proud Of

- Building a product that goes deeper than generic stat dashboards by treating timeline and contextual data as first-class inputs
- Balancing UX polish with backend realism, especially around onboarding, caching, queueing, and fallback states
- Shipping explainable ML into a player-facing interface instead of stopping at offline notebooks

## What I’d Improve Next

- Add a polished recorded demo GIF and more outcome-focused screenshots
- Add a hosted Prometheus/Grafana monitoring path for the deployed backend
- Expand model evaluation reporting directly in the dashboard or ops tooling
- Add stronger integration tests around onboarding, refresh, and prediction flows

## Portfolio / LinkedIn Copy

Short summary:

> Built Farsight Analytics, a production-style League of Legends intelligence platform using FastAPI, Next.js, PostgreSQL, TimescaleDB, Redis, Celery, and XGBoost to deliver timeline-aware match analysis, explainable tilt detection, and draft win probability.

Three strong bullet points:

- Engineered a Riot-safe ingestion pipeline with Celery and Redis to onboard and refresh tracked profiles asynchronously while supporting rich player and match analytics.
- Modeled minute-level match timeline data in TimescaleDB hypertables to power gold-diff views, pressure analysis, and deeper performance breakdowns than traditional stat trackers.
- Served explainable ML features in production, including SHAP-informed tilt explanations and draft probability inference backed by scikit-learn and XGBoost artifacts.

Suggested LinkedIn tags:

- `Python`
- `FastAPI`
- `Next.js`
- `PostgreSQL`
- `TimescaleDB`
- `XGBoost`
- `Docker`
- `Redis`
- `Celery`
