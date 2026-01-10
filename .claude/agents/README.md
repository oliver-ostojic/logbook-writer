# Custom Claude Code Agents

This directory contains specialized agents tailored for the logbook-writer codebase.

## Available Agents

### 1. **solver-expert**
Expert on constraint solver, MILP optimization, fairness algorithms, and ML-based tuning.

**Use when**:
- Debugging schedule quality or infeasibility
- Understanding fairness metrics and tiered rotation
- Analyzing preference banking and adaptive weights
- Tuning solver parameters
- Working with Python solver integration

**Example prompts**:
- "Why is the fairness index low for DEMO roles?"
- "How does tiered rotation boost work?"
- "Explain the constraint violation in this schedule"
- "How can I tune the solver for better preference satisfaction?"

---

### 2. **api-database-expert**
Expert on Fastify API routes, Prisma ORM, database schema, and data relationships.

**Use when**:
- Adding new API endpoints
- Working with database schema
- Understanding table relationships
- Debugging data persistence issues
- Implementing CRUD operations

**Example prompts**:
- "How do I add a new endpoint for crew availability?"
- "What's the relationship between RolePreference and CrewPreference?"
- "Show me how to update the Shift table schema"
- "Where are coverage windows validated in the API?"

---

### 3. **fairness-dashboard-expert**
Expert on fairness tracking, dashboard metrics, visualization, and analytics.

**Use when**:
- Working on dashboard features
- Understanding fairness calculations (Gini, letter grades)
- Debugging visualization issues
- Analyzing role distribution
- Implementing new charts or metrics

**Example prompts**:
- "How is the Gini coefficient calculated?"
- "Why are the histogram buckets not showing correct crew counts?"
- "Explain the tiered rotation boost algorithm"
- "How do I add a new metric to the fairness dashboard?"

---

### 4. **testing-expert**
Expert on test architecture, Vitest usage, test patterns, and quality assurance.

**Use when**:
- Writing new tests
- Debugging failing tests
- Understanding test coverage
- Creating integration tests
- Setting up test data

**Example prompts**:
- "Write tests for the new preference banking endpoint"
- "How do I test the solver integration?"
- "Why is the fairness-index.test.ts failing?"
- "What's the best way to clean up test data?"

---

## How to Use These Agents

### Automatic Invocation

Claude will automatically use the appropriate agent based on your question:

```bash
# Claude will invoke solver-expert
claude "Why is my schedule infeasible?"

# Claude will invoke api-database-expert
claude "Add a new endpoint for managing crew preferences"

# Claude will invoke fairness-dashboard-expert
claude "The fairness chart is showing wrong data"

# Claude will invoke testing-expert
claude "Write tests for the new coverage endpoint"
```

### Explicit Invocation

You can explicitly request a specific agent:

```bash
claude "Use solver-expert to explain how consecutive policy constraints work"

claude "Ask api-database-expert: How do I query all shifts for a specific crew member?"

claude "fairness-dashboard-expert: What tables are used for fairness tracking?"
```

### Multiple Agents

You can involve multiple agents for complex analysis:

```bash
claude "Analyze the preference satisfaction system:
- solver-expert: How are preferences weighted in the objective?
- api-database-expert: Show the preference data model
- testing-expert: What tests cover preference satisfaction?"
```

---

## Agent Capabilities

All agents have **read-only access** to:
- `Read` - Read files
- `Grep` - Search code
- `Glob` - Find files by pattern

Agents **cannot**:
- Write or edit files
- Execute commands
- Make API calls

They focus on **analysis, explanation, and guidance**.

---

## Tips for Best Results

1. **Be specific**: "How does fairness boost work?" is better than "Explain fairness"

2. **Provide context**: "The solver returned INFEASIBLE for storeId 768 on 2025-01-06"

3. **Reference files**: "In builder.ts, why is the lookbackDays default 7?"

4. **Ask for comparisons**: "What's the difference between HOURLY and WINDOW assignment models?"

5. **Request code examples**: "Show me how to create a new RoleRule with MIN_CONSECUTIVE_MINUTES"

---

## Extending Agents

To add a new agent:

1. Create a new markdown file in this directory (e.g., `performance-expert.md`)
2. Follow the structure of existing agents:
   - Title and description
   - When to use
   - Expertise areas
   - Key commands
   - Analysis approach
   - Tools and model settings
3. Restart Claude Code to load the new agent

---

## Questions?

These agents are built on top of your `CLAUDE.md` file. They combine:
- General codebase knowledge (from CLAUDE.md)
- Specialized domain expertise (from agent prompts)
- Read-only access to your code

For issues or suggestions, update the agent markdown files in this directory.
