const db = require('./db');

/**
 * Build a structured context graph from the database.
 * Returns an object representing the user's full context.
 */
function buildContextGraph() {
    const goals = db.getActiveGoals();
    const allTasks = db.getTasks();
    const events = db.getUpcomingEvents();
    const habits = db.getHabits();
    const recentActivity = db.getActivityLogs(20);
    const lastActivity = db.getLastActivity();

    // Build goals with nested tasks
    const goalTree = goals.map(goal => ({
        ...goal,
        tasks: allTasks.filter(t => t.goal_id === goal.id),
    }));

    // Unassigned tasks
    const unassignedTasks = allTasks.filter(t => !t.goal_id && t.status === 'pending');

    return {
        goals: goalTree,
        unassignedTasks,
        events,
        habits,
        recentActivity,
        lastActivity,
        stats: {
            totalGoals: goals.length,
            totalPendingTasks: allTasks.filter(t => t.status === 'pending').length,
            totalCompletedTasks: allTasks.filter(t => t.status === 'completed').length,
        },
    };
}

/**
 * Generate a concise text summary of the context graph for the LLM system prompt.
 */
function getContextSummary() {
    const ctx = buildContextGraph();
    const lines = [];

    // Goals & tasks
    if (ctx.goals.length > 0) {
        lines.push('## Active Goals');
        ctx.goals.forEach(g => {
            lines.push(`- ${g.title} (${g.type}, progress: ${g.progress}%, deadline: ${g.deadline || 'none'})`);
            g.tasks.forEach(t => {
                lines.push(`  - Task: ${t.title} [${t.status}] (deadline: ${t.deadline || 'none'}, priority: ${t.priority})`);
            });
        });
    }

    if (ctx.unassignedTasks.length > 0) {
        lines.push('## Pending Tasks (no goal)');
        ctx.unassignedTasks.forEach(t => {
            lines.push(`- ${t.title} (deadline: ${t.deadline || 'none'}, priority: ${t.priority})`);
        });
    }

    // Events
    if (ctx.events.length > 0) {
        lines.push('## Upcoming Events');
        ctx.events.forEach(e => {
            lines.push(`- ${e.title} on ${e.date} (importance: ${e.importance})`);
        });
    }

    // Habits
    if (ctx.habits.length > 0) {
        lines.push('## Detected Habits');
        ctx.habits.forEach(h => {
            lines.push(`- ${h.name}: ${h.description || ''} (confidence: ${(h.confidence * 100).toFixed(0)}%)`);
        });
    }

    // Recent activity
    if (ctx.recentActivity.length > 0) {
        lines.push('## Recent Activity (last few entries)');
        ctx.recentActivity.slice(0, 5).forEach(a => {
            lines.push(`- ${a.action}${a.task ? ': ' + a.task : ''} (${a.duration_min}min) at ${a.timestamp}`);
        });
    }

    // Stats
    lines.push(`## Stats: ${ctx.stats.totalGoals} active goals, ${ctx.stats.totalPendingTasks} pending tasks, ${ctx.stats.totalCompletedTasks} completed tasks`);

    // Last activity time
    if (ctx.lastActivity) {
        lines.push(`Last activity: ${ctx.lastActivity.timestamp}`);
    } else {
        lines.push('No activity recorded yet.');
    }

    return lines.join('\n');
}

module.exports = { buildContextGraph, getContextSummary };
