PY=python3

setup:
	$(PY) -m pip install -e .[dev]

lint:
	ruff check .

format:
	black .

format-check:
	black --check .

typecheck:
	mypy app

test:
	pytest -q

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port $${PORT:-8080}

build:
	docker build -t snap-export-to-google-photos-gcp:local .

bootstrap-local:
	./scripts/bootstrap_local.sh

tf-plan:
	./scripts/tf.sh plan

tf-apply:
	./scripts/tf.sh apply
