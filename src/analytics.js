const db = require('./db');

/**
 * Get daily productivity stats for a given date (YYYY-MM-DD).
 */
function getDailyStats(date) {
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;
    const logs = db.getActivityBetween(dayStart, dayEnd);

    const totalMinutes = logs.reduce((sum, l) => sum + (l.duration_min || 0), 0);
    const focusSessions = logs.filter(l => (l.duration_min || 0) >= 25).length; // 25+ min = focus session

    // Hourly breakdown
    const hourly = {};
    logs.forEach(l => {
        const h = new Date(l.timestamp).getHours();
        hourly[h] = (hourly[h] || 0) + (l.duration_min || 0);
    });
    const peakHour = Object.entries(hourly).sort((a, b) => b[1] - a[1])[0];

    // Task counts for the day
    const allTasks = db.getTasks();
    const completedToday = allTasks.filter(t => t.status === 'completed' && t.created_at && t.created_at.startsWith(date)).length;
    const missedToday = allTasks.filter(t => t.status === 'pending' && t.deadline && t.deadline <= date).length;

    return {
        date,
        productiveMinutes: totalMinutes,
        productiveTime: formatDuration(totalMinutes),
        tasksCompleted: completedToday,
        tasksMissed: missedToday,
        focusSessions,
        peakHour: peakHour ? `${peakHour[0]}:00` : 'N/A',
        sessionCount: logs.length,
        hourlyBreakdown: hourly,
    };
}

/**
 * Get weekly stats starting from a given date.
 */
function getWeeklyStats(weekStartDate) {
    const start = new Date(weekStartDate);
    const dailyStats = [];
    let totalMinutes = 0;
    let totalCompleted = 0;
    let totalMissed = 0;
    let totalFocusSessions = 0;
    let bestDay = { date: '', minutes: 0 };

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const stats = getDailyStats(dateStr);
        dailyStats.push(stats);

        totalMinutes += stats.productiveMinutes;
        totalCompleted += stats.tasksCompleted;
        totalMissed += stats.tasksMissed;
        totalFocusSessions += stats.focusSessions;
        if (stats.productiveMinutes > bestDay.minutes) {
            bestDay = { date: dateStr, day: d.toLocaleDateString('en-US', { weekday: 'long' }), minutes: stats.productiveMinutes };
        }
    }

    const avgFocusSession = totalFocusSessions > 0 ? Math.round(totalMinutes / totalFocusSessions) : 0;

    return {
        weekStart: weekStartDate,
        totalProductiveHours: Math.round(totalMinutes / 60 * 10) / 10,
        totalProductiveMinutes: totalMinutes,
        tasksCompleted: totalCompleted,
        tasksMissed: totalMissed,
        avgFocusSessionMinutes: avgFocusSession,
        bestDay,
        dailyBreakdown: dailyStats,
    };
}

/**
 * Get monthly stats for a given month (YYYY-MM).
 */
function getMonthlyStats(month) {
    const [year, mon] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    let totalMinutes = 0;
    let totalCompleted = 0;
    let activeDays = 0;
    const dailyMinutes = [];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const stats = getDailyStats(dateStr);
        dailyMinutes.push({ date: dateStr, minutes: stats.productiveMinutes });
        totalMinutes += stats.productiveMinutes;
        totalCompleted += stats.tasksCompleted;
        if (stats.productiveMinutes > 0) activeDays++;
    }

    const goalsAchieved = db.getGoals().filter(g => g.status === 'completed').length;
    const consistencyScore = Math.round((activeDays / daysInMonth) * 100);

    return {
        month,
        totalProductiveHours: Math.round(totalMinutes / 60 * 10) / 10,
        goalsAchieved,
        consistencyScore,
        activeDays,
        totalDays: daysInMonth,
        tasksCompleted: totalCompleted,
        dailyBreakdown: dailyMinutes,
    };
}

/**
 * Get a productivity timeline (array of {date, minutes}) for charting.
 */
function getProductivityTimeline(days = 30) {
    const timeline = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayStart = `${dateStr}T00:00:00`;
        const dayEnd = `${dateStr}T23:59:59`;
        const logs = db.getActivityBetween(dayStart, dayEnd);
        const totalMin = logs.reduce((s, l) => s + (l.duration_min || 0), 0);
        timeline.push({ date: dateStr, minutes: totalMin });
    }
    return timeline;
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Compute a 0-100 productivity score from multiple factors.
 */
function getProductivityScore() {
    const today = new Date().toISOString().split('T')[0];
    const daily = getDailyStats(today);
    const { detectStreaks } = require('./patternAnalyzer');
    const logs = db.getActivityLogs(200);
    const streaks = detectStreaks(logs);

    // Scoring weights
    const taskScore = Math.min(daily.tasksCompleted * 15, 30);        // max 30
    const focusScore = Math.min(daily.focusSessions * 10, 25);        // max 25
    const timeScore = Math.min(daily.productiveMinutes / 3, 25);      // max 25 (75+ min = full)
    const streakScore = Math.min(streaks.currentStreak * 5, 20);      // max 20

    const total = Math.min(Math.round(taskScore + focusScore + timeScore + streakScore), 100);

    return {
        score: total,
        breakdown: {
            tasks: Math.round(taskScore),
            focus: Math.round(focusScore),
            time: Math.round(timeScore),
            streak: Math.round(streakScore),
        },
        currentStreak: streaks.currentStreak,
    };
}

module.exports = { getDailyStats, getWeeklyStats, getMonthlyStats, getProductivityTimeline, getProductivityScore };
