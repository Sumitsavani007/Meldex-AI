# REAL BENCHMARK REPORT

BENCHMARK COMPLETE

- Total tasks: 50
- Passed: 3
- Failed: 47
- Success: 6%
- Benchmark projects: 5
- Task types per project: 10
- Qwen/backend path attempted: yes
- Fast-path passes: 3

## Biggest Failure Patterns

- backend coding engine unavailable: 46
- passed: 3
- orchestrator confidence stop: 1

## Result By Project

- static-html: 0/10 passed (0%)
- next-sample: 1/10 passed (10%)
- vite-react: 0/10 passed (0%)
- node-express: 1/10 passed (10%)
- php-simple: 1/10 passed (10%)

## Result By Task Type

- landing: 3/5 passed (60%)
- dark-mode: 0/5 passed (0%)
- syntax-error: 0/5 passed (0%)
- api-route: 0/5 passed (0%)
- readme: 0/5 passed (0%)
- build-check: 0/5 passed (0%)
- preview: 0/5 passed (0%)
- autofix: 0/5 passed (0%)
- accessibility: 0/5 passed (0%)
- test-health: 0/5 passed (0%)

## Important Observations

- 46 tasks failed immediately after the backend agent call returned: `The coding engine is temporarily unavailable. Please try again shortly.`
- Those failures produced no patch, so build/test/autofix loops were not reached.
- 3 tasks passed through the CLI static landing-page fast path, not through Qwen generation.
- 1 task stopped before backend execution because AOE confidence was below the execution threshold.

## Results

| Project | Task | Result | Files Changed | Build Passed | Preview Verified | Retries | Time | Quality | Primary Pattern |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| static-html | landing | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | dark-mode | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | syntax-error | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | api-route | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | readme | FAIL | 0 | yes | no | 0 | 0s | 68 | orchestrator confidence stop |
| static-html | build-check | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | preview | FAIL | 0 | no | no | 0 | 2s | 4 | backend coding engine unavailable |
| static-html | autofix | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | accessibility | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| static-html | test-health | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | landing | PASS | 4 | yes | no | 0 | 1s | 92 | passed |
| next-sample | dark-mode | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | syntax-error | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | api-route | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | readme | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | build-check | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | preview | FAIL | 0 | no | no | 0 | 2s | 4 | backend coding engine unavailable |
| next-sample | autofix | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | accessibility | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| next-sample | test-health | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | landing | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | dark-mode | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | syntax-error | FAIL | 0 | no | no | 0 | 3s | 16 | backend coding engine unavailable |
| vite-react | api-route | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | readme | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | build-check | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | preview | FAIL | 0 | no | no | 0 | 2s | 4 | backend coding engine unavailable |
| vite-react | autofix | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | accessibility | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| vite-react | test-health | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | landing | PASS | 4 | yes | no | 0 | 1s | 92 | passed |
| node-express | dark-mode | FAIL | 0 | no | no | 0 | 3s | 16 | backend coding engine unavailable |
| node-express | syntax-error | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | api-route | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | readme | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | build-check | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | preview | FAIL | 0 | no | no | 0 | 2s | 4 | backend coding engine unavailable |
| node-express | autofix | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | accessibility | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| node-express | test-health | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | landing | PASS | 4 | yes | no | 0 | 1s | 92 | passed |
| php-simple | dark-mode | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | syntax-error | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | api-route | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | readme | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | build-check | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | preview | FAIL | 0 | no | no | 0 | 2s | 4 | backend coding engine unavailable |
| php-simple | autofix | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | accessibility | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
| php-simple | test-health | FAIL | 0 | no | no | 0 | 2s | 16 | backend coding engine unavailable |
