# Picks candidates

Draft list for the page pass. Cut each part to 4 to 6 picks with at least two videos, then delete this file.
Each line gives author, year and why it passes the bar in section 5 of STANDARD-v2: made by the maker or the team that runs it, about the idea, not a listicle or paywall.
Titles and years are from memory and no link has been checked yet. The page pass finds the live link, marks which picks are videos, and drops any that fail the nightly link check.

## Orientation: meet the desk

- Anthropic, "How Anthropic enables self-service data analytics with Claude", 2025. The team that runs the method in production, on the same problem the desk solves. Idea, not a launch.
- Anthropic, "Building effective agents", 2024. Written by the maker. Evergreen on when an agent is worth it and when a plain workflow is enough.
- Anthropic, "Demystifying evals for AI agents", 2026. Engineering blog from the model maker. Sets up why a score on real questions comes first.
- Hamel Husain, "Your AI product needs evals", 2024. Practitioner who ran evals in production. Evergreen, about the habit not a tool.
- Eugene Yan, "Patterns for building LLM-based systems and products", 2023. Applied scientist writing from his own production work. Not a listicle: each pattern has a source.
- Simon Willison, "Prompt injection explained", 2023 talk notes. Coined the term and tracks the problem. Evergreen framing for the whole course.
- Andrej Karpathy, "Intro to Large Language Models", 2023 talk. Major talk by a founding researcher. Gives a plain base for what a model is.
- Olist, Brazilian E-Commerce Public Dataset, 2018. The data owner's own description of the tables the desk reads.

## 01 Score the naive agent

- Anthropic, "How Anthropic enables self-service data analytics with Claude", 2025. Names the accuracy and the wrong-but-looks-right failure that this part scores.
- Spider: Yu et al., "Spider: A Large-Scale Human-Labeled Dataset for Text-to-SQL", 2018 (EMNLP). The original paper behind the standard text-to-SQL benchmark.
- BIRD: Li et al., "Can LLM Already Serve as a Database Interface?", 2023 (NeurIPS). Original paper. Shows messy values and execution-based scoring, the idea this part uses.
- Hamel Husain, "Your AI product needs evals", 2024. Practitioner who built evals in production. About error analysis first.
- Hamel Husain and Shreya Shankar, "Evals FAQ", 2025. Both teach evals to engineers and ran them in practice. Evergreen answers.
- Anthropic, "Demystifying evals for AI agents", 2026. Maker's engineering blog on scoring agents by outcome.
- Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", 2023. Original paper on judge models, with their known biases.
- Zhong et al., "Semantic Evaluation for Text-to-SQL with Distilled Test Suites", 2020 (EMNLP). Original paper: why matching text is the wrong score, matching rows is better.
- Pourreza and Rafiei, "DIN-SQL", 2023 (NeurIPS). Original paper with an error breakdown that mirrors the trap labels.

## 02 Lock the database

- SQLite documentation, "URI Filenames" and "Read-Only Databases". The maker's own docs. Evergreen: mode=ro has not changed.
- OWASP, "SQL Injection Prevention Cheat Sheet". Standards body, maintained, about the idea.
- OWASP, "Top 10 for LLM Applications", 2025. Same body. Covers prompt injection and excessive agency.
- Simon Willison, "The lethal trifecta for AI agents", 2025. Researcher who named the pattern. Explains why private data plus untrusted text is the risk.
- Simon Willison, "Prompt injection: what's the worst that can happen?", 2023. Evergreen examples of an injected comment doing harm.
- Greshake et al., "Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection", 2023. Original paper for the attack in this part.
- Beurer-Kellner et al., "Design Patterns for Securing LLM Agents against Prompt Injections", 2025. Paper by a team from several labs. Patterns such as the plan-then-execute and the action selector.
- Anthropic, "Mitigate jailbreaks and prompt injections", docs. Maker's official docs.
- sqlglot project, README and docs. The tool's own docs, by its authors.

## 03 Define the metrics

- Anthropic, "How Anthropic enables self-service data analytics with Claude", 2025. Describes a shared metric and data-model doc as the base for trusted answers.
- dbt Labs, "About MetricFlow" and the Semantic Layer docs. The team that makes it. Evergreen on defining a metric once.
- Airbnb Engineering, "How Airbnb Standardized Metric Computation at Scale" (Minerva), 2021. A company's engineering blog on its production metric layer.
- Cube, "What is a semantic layer?" docs. Maker's docs. Explains the idea in plain terms.
- Benn Stancil, "The missing piece of the modern data stack", 2021. Practitioner essay that made the case for a metrics layer. Evergreen.
- Snowflake, "Cortex Analyst semantic model specification", docs. Vendor docs showing a metric file used by a text-to-SQL agent.
- Google Cloud, "Looker semantic layer" docs and LookML intro. Original maker of the idea in many shops.

## 04 Retrieve the context

- Pourreza et al., "CHESS: Contextual Harnessing for Efficient SQL Synthesis", 2024. Original paper on schema pruning and value retrieval.
- Gao et al., "Text-to-SQL Empowered by Large Language Models: A Benchmark Evaluation" (DAIL-SQL), 2023. Original paper on picking examples to show the model.
- Anthropic, "Introducing Contextual Retrieval", 2024. Maker's blog, on why chunks need context. Evergreen idea.
- Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", 2020 (NeurIPS). The original RAG paper.
- Muennighoff et al., "MTEB: Massive Text Embedding Benchmark", 2022. Original paper for comparing embedding models, including multilingual ones.
- Wang et al., "Multilingual E5 Text Embeddings: A Technical Report", 2024. The authors of the model family used for cross-language search.
- SQLite documentation, "FTS5 Extension". Maker's docs for the full-text search used here.
- Hamel Husain, "A Field Guide to Rapidly Improving AI Products", 2025. Practitioner guide, evergreen: look at the data, fix retrieval first.
- Jason Liu, "Low-hanging fruit for RAG search", 2024. Practitioner who consults on retrieval, with measured changes.
- Anthropic, "Building effective agents", 2024. Maker's guide that stresses simple retrieval tools.

## 05 Build the loop

- Anthropic, "Building effective agents", 2024. Maker's routing and evaluator patterns, the shape of this loop.
- Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models", 2022 (ICLR 2023). The original paper for the loop.
- Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning", 2023. Original paper on learning from an error, the retry idea.
- Anthropic, "How Anthropic enables self-service data analytics with Claude", 2025. Source of the answer footer and the reviewer cost numbers.
- Anthropic, "How we built our multi-agent research system", 2025. Maker's engineering write-up that also shows tracing and cost per run.
- OpenTelemetry, "Semantic conventions for generative AI", docs. The standards group's spec for tracing model calls, tokens and time.
- Langfuse, "LLM observability and tracing" docs. The maker's docs on traces, token cost and latency per request.
- Gao et al., "Enabling Large Language Models to Generate Text with Citations" (ALCE), 2023. Original paper for answers that cite their sources.
- Chip Huyen, "Building A Generative AI Platform", 2024. Author of a standard ML systems book, on routing and observability.

## 06 Answer with UI

- Google, "A2UI" project site and spec. The team that made the protocol. Docs, not a launch post.
- AG-UI Protocol, official docs. The protocol's own docs on streaming events to a UI.
- MDN Web Docs, "Server-sent events". Browser vendor docs, evergreen.
- Vercel, "Generative user interfaces" in the AI SDK docs. Maker's docs on UI from model output.
- Anthropic, "Writing effective tools for AI agents", 2025. Maker's guide on shaping what a tool returns.
- Nielsen Norman Group, "Visibility of system status", 1994 and updates. The group that wrote the heuristic. Evergreen for streaming progress.
- Simon Willison, "Markdown exfiltration and image-based attacks in chat UIs", posts 2023 to 2024. Researcher on why rendering model output needs a safe catalog.
- React team, "Thinking in React", official docs. Official docs, evergreen for a component catalog.

## 07 Approve the write

- Anthropic, "Building effective agents", 2024. Maker's advice on human checkpoints for risky actions.
- LangGraph docs, "Human-in-the-loop" and "Interrupts". Maker's docs for the pause and resume pattern.
- Anthropic, Claude Code docs, "Permissions". Maker's design of ask-before-acting for a real agent.
- OWASP, "Top 10 for LLM Applications: Excessive Agency", 2025. Standards body on why writes need approval.
- Simon Willison, "The lethal trifecta for AI agents", 2025. Why an approval step belongs before any action that leaves the system.
- Google SRE Book, "Postmortem culture: learning from failure", 2016. The team that runs it. Evergreen for writing down a decision and its reason.
- Martin Fowler, "Audit Log", patterns. Well-known engineer. Evergreen description of the pattern.
- NIST, "AI Risk Management Framework", 2023. Standards body. Covers human oversight and records.

## 08 Delegate over A2A

- Google, "Announcing the Agent2Agent Protocol", 2025. The team that made it. Read for the idea, not the launch.
- A2A Protocol, official specification and docs. The spec itself, kept by the project.
- A2A Protocol, "A2A and MCP" page. Maker's explanation of how it differs from tool protocols.
- Anthropic, "Introducing the Model Context Protocol", 2024. Maker's post, for the tool side of the picture.
- IETF, RFC 7515 "JSON Web Signature", 2015. The standard behind a signed card.
- IETF, RFC 8785 "JSON Canonicalization Scheme", 2020. The standard for signing JSON the same way every time.
- Anthropic, "How we built our multi-agent research system", 2025. Maker's lessons from running many agents.
- Cognition, "Don't build multi-agents", 2025. Team that runs agents in production, with a counter view. Evergreen trade-offs.

## 09 Gate every change

- Anthropic, "How Anthropic enables self-service data analytics with Claude", 2025. Source for the same-pull-request rule between data docs and metrics.
- Anthropic, "Demystifying evals for AI agents", 2026. Maker's guide to gating a release with evals.
- Hamel Husain, "Your AI product needs evals", 2024. Practitioner on evals as the test suite.
- Hamel Husain and Shreya Shankar, "Evals FAQ", 2025. Practical answers on sampling real questions into an eval set.
- Shankar et al., "Who Validates the Validators?", 2024 (UIST). Original paper on checking your judge and growing criteria from real outputs.
- Google, "Hidden Technical Debt in Machine Learning Systems", 2015 (NeurIPS). Original paper, evergreen on why change needs a gate.
- Jia and Harman, "An Analysis and Survey of the Development of Mutation Testing", 2011. The survey paper for the mutant idea.
- Martin Fowler, "Continuous Integration". Well-known engineer on gating every change. Evergreen.
- Chip Huyen, "Building A Generative AI Platform", 2024. Author of a standard ML systems book, on evaluation and monitoring.

## 10 Serve the logistics agent with the A2A SDK

- A2A Protocol, "Python SDK" docs and repository README. The authors' own SDK docs.
- A2A Protocol, official specification. The source of truth for the server shape.
- Google, "Announcing the Agent2Agent Protocol", 2025. The makers on why it exists.
- A2A Protocol, "Life of a Task" page. Maker's explanation of the task states a server must report.
- Linux Foundation, "A2A project" announcement, 2025. The foundation now hosting it, on how it is governed.
- MDN Web Docs, "Using server-sent events". Browser vendor docs for the streaming that tasks use.
- Anthropic, "Writing effective tools for AI agents", 2025. Maker's guide on clear contracts between an agent and its tools.

## 11 Track changed facts with Graphiti

- Zep, "Zep: A Temporal Knowledge Graph Architecture for Agent Memory", 2025. The paper by the makers of Graphiti.
- Zep and Graphiti repository README and docs. The maker's docs for the tool used in the step.
- Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", 2024 (Microsoft). Original paper on graph-based retrieval.
- Neo4j, "What is a knowledge graph?" docs. The database maker's plain explainer.
- Snodgrass and Ahn, "Temporal Databases", 1986, and Martin Fowler, "Bitemporal History". The idea of when a fact was true versus when you learned it. Evergreen.
- Anthropic, "Effective context engineering for AI agents", 2025. Maker's guide on what an agent should remember.
- Packer et al., "MemGPT: Towards LLMs as Operating Systems", 2023. Original paper on agent memory.
- Hogan et al., "Knowledge Graphs", 2021 (ACM Computing Surveys). Survey paper by well-known researchers. Evergreen.
