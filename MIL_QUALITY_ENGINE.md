# MIL Quality Engine

Every completed task receives a quality score:

- Maintainability
- Readability
- Performance
- Security
- Architecture
- Testing
- Overall

Quality gates include:

- no obvious unsafe paths
- no secret writes
- no fake imports
- self-review complete
- build/lint/test when available
- preview HTTP 200 verification when requested

The insight panel summarizes quality, risk, changed files, build status, preview status, and recommendations.
