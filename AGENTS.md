# Project rules

- This repository is an independent prototype. Do not modify or assume access to the existing seteuk.site codebase.
- Keep model-provider code behind the harness boundary so Claude, OpenAI, or another provider can be replaced without changing student memory and evaluation logic.
- Never send an entire student history to a model by default. Retrieve only the evidence needed for the current task.
- Every recommendation must include student-specific evidence and a concrete reason.
- Treat generated recommendations as candidates. The reviewer stage must be able to reject unsupported, repetitive, or unsafe output.
- Store feedback as an append-only signal. Do not silently rewrite the original recommendation run.
- Do not include real student-identifying data in samples, tests, or logs.
- Run `npm run build` and `npm test` after behavior changes.
- Read `docs/semiconductor-pilot-v0.3.md` and `docs/semiconductor-evaluation-set-v0.1.md` before changing the pilot domain, provider contract, or recommendation rubric.
