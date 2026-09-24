---
title: 'I built a lint hook for agent loops'
description: 'ralph-hook-lint runs your linter after every Write/Edit and blocks the agent until errors are fixed.'
pubDate: '2026-01-31'
tags: [ai, llm, agents]
thumbnail: '../../assets/ralph-hook-lint/thumbnail.png'
---

I built a hook for ~~Ralph Wiggum~~ agent loop

I got tired of CC forgetting to run linter after editing files. And when it did remember, running the global linter on every change was painfully slow.

This matters when you run an agent for hours. Errors compound.

It get worse if you across different programming languages.

So I built ralph-hook-lint. It runs your linter after every Write/Edit, (Async) blocks the agent until errors are fixed, Supports JS/TS, Rust, Python, Java, and Go. Works with monorepos too. Uses your existing linter config.

[github.com/chenhunghan/ralph-hook-lint](https://github.com/chenhunghan/ralph-hook-lint)
