# Farsight Analytics 

An advanced, machine-learning-powered player intelligence platform for League of Legends. 

Farsight Analytics goes far beyond standard metric trackers (like basic KDA or win rates). By ingesting raw timeline data from the Riot Games API, it utilizes machine learning models to provide predictive insights, draft win probabilities, and tilt detection, helping players improve their strategic decision-making and promote healthier gaming habits.

## 🚀 Core Features

### Predictive Analytics
* **Draft Win Probability:** Predicts the outcome of a match before it begins based on team compositions (poke, engage, peel semantic scores) and historical player mastery.
* **Tilt Detection:** Analyzes recent match history and performance degradation (e.g., KDA slopes, consecutive losses) to predict "tilt" and suggest when a player should take a break.
* **Power Spike Forecasting:** Uses K-Means clustering on historical timeline data to predict the specific minute marks where a player is statistically most likely to hold a meaningful gold advantage and carry the game.

### Deep Match Analysis
* **Micro-Stat Tracking:** Minute-by-minute gold and XP curves compared against positional and top-rank averages.
* **Vision & Damage Impact:** Advanced correlations showing how vision score impacts win rates and damage-share versus gold-share quadrant analysis.
* **Champion Matchup Insights:** Algorithmic lane suggestions and heatmap matrices based on a player's personal historical data against specific enemy champions.

---

## 🛠 Tech Stack

This project is built using a modern, production-grade stack optimized for heavy data ingestion, time-series querying, and machine learning model serving.

**Frontend**
* **Framework:** Next.js 14 (App Router) + TypeScript
* **Styling:** TailwindCSS + shadcn/ui
* **Data Visualization:** Recharts (standard charts) + D3.js (custom hexbins and timeline brushes)

**Backend & Data Pipeline**
* **API Layer:** FastAPI (Python 3.11+) for async, concurrent processing
* **Task Queue:** Celery + Redis Broker for background ingestion and Riot API rate-limit management
* **Machine Learning:** scikit-learn, XGBoost, pandas

**Database & Infrastructure**
* **Primary DB:** PostgreSQL 16 
* **Time-Series Extension:** TimescaleDB (for millisecond-speed hypertable queries on match timeline frames)
* **Caching & Rate Limiting:** Redis 7 (Token-bucket implementation for Riot API compliance)
* **Deployment:** Docker Compose, Vercel (Frontend), Railway (Backend/Workers)

---

## 🏗 System Architecture

The platform is designed around three distinct data flows to handle Riot's strict API limits (20 req/s & 100 req/2min) while providing a fast user experience:

1.  **Ingestion (Background):** Celery workers continually fetch and parse match timelines, utilizing a dual-bucket Redis rate limiter to stay within Riot's quotas.
2.  **Query (Cached):** FastAPI serves Next.js frontend requests, heavily caching standard profile queries via Redis. Time-range queries are optimized via TimescaleDB hypertables.
3.  **Prediction (On-Demand):** Pre-trained XGBoost and scikit-learn models are loaded into memory on the FastAPI server to provide real-time inference for tilt scores and draft probabilities.

---

## 🗺 Project Roadmap

* **Phase 1: Foundation:** Riot API integration, PostgreSQL/TimescaleDB schema initialization, and basic ingestion CLI.
* **Phase 2: Data Pipeline:** Celery background workers and robust rate-limiting.
* **Phase 3: Core Dashboard:** Next.js UI, profile pages, and baseline standard statistics.
* **Phase 4: Advanced Analytics:** D3.js data visualizations, gold curve comparisons, and playstyle fingerprinting.
* **Phase 5: Machine Learning:** Training and serving XGBoost models for tilt detection and draft probability.
* **Phase 6: Production:** Dockerization, CI/CD, and deployment to Vercel/Railway.

---

## ⚖️ Legal Disclaimer
Farsight Analytics was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.