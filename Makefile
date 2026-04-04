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
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8080

build:
	docker build -t snap-export-to-google-photos-gcp:local .

deploy:
	@echo "Use Terraform + Cloud Run deploy workflow"
