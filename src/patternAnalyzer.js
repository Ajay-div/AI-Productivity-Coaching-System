const db = require('./db');

/**
 * Detect which hours are most productive.
 * Returns array of { hour, totalMinutes, sessionCount }.
 */
function detectProductiveHours(logs) {
    const hourMap = {};
    for (const log of logs) {
        if (!log.timestamp) continue;
        const hour = new Date(log.timestamp).getHours();
        if (!hourMap[hour]) hourMap[hour] = { hour, totalMinutes: 0, sessionCount: 0 };
        hourMap[hour].totalMinutes += log.duration_min || 0;
        hourMap[hour].sessionCount++;
    }
    return Object.values(hourMap).sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/**
 * Detect inactivity gaps (periods > threshold hours with no logged activity).
 */
function detectInactivityGaps(logs, thresholdHours = 48) {
    if (logs.length < 2) return [];
    const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1].timestamp);
        const curr = new Date(sorted[i].timestamp);
        const diffHours = (curr - prev) / (1000 * 60 * 60);
        if (diffHours >= thresholdHours) {
            gaps.push({ from: sorted[i - 1].timestamp, to: sorted[i].timestamp, hours: Math.round(diffHours) });
        }
    }
    return gaps;
}

/**
 * Detect if user tends to skip weekends.
 */
function detectWeekendSkipping(logs) {
    let weekdayCount = 0, weekendCount = 0;
    for (const log of logs) {
        const day = new Date(log.timestamp).getDay();
        if (day === 0 || day === 6) weekendCount++;
        else weekdayCount++;
    }
    const totalDays = weekdayCount + weekendCount;
    if (totalDays < 7) return null; // not enough data
    const weekendRatio = weekendCount / totalDays;
    // Weekends are 2/7 ≈ 28.6% of the week. If ratio is much lower, user skips weekends.
    return {
        skipsWeekends: weekendRatio < 0.15,
        weekendRatio: Math.round(weekendRatio * 100),
        confidence: Math.min(totalDays / 30, 1), // more data = higher confidence
    };
}

/**
 * Detect productivity streaks (consecutive days with activity).
 */
function detectStreaks(logs) {
    if (logs.length === 0) return { currentStreak: 0, longestStreak: 0 };

    // Get unique active days
    const activeDays = new Set();
    for (const log of logs) {
        activeDays.add(new Date(log.timestamp).toISOString().split('T')[0]);
    }
    const sortedDays = [...activeDays].sort();

    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
            streak++;
        } else {
            longestStreak = Math.max(longestStreak, streak);
            streak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, streak);

    // Check if current streak is still active (last active day is today or yesterday)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const lastActiveDay = sortedDays[sortedDays.length - 1];

    if (lastActiveDay === today || lastActiveDay === yesterday) {
        currentStreak = streak;
    } else {
        currentStreak = 0;
    }

    return { currentStreak, longestStreak };
}

/**
 * Detect if user loses focus after a certain hour.
 */
function detectFocusDropoff(logs) {
    const hourlyProductivity = detectProductiveHours(logs);
    if (hourlyProductivity.length < 3) return null;

    // Find the hour after which productivity drops significantly
    const peakHour = hourlyProductivity[0];
    const lateHours = hourlyProductivity.filter(h => h.hour >= 21); // 9pm+
    const earlyHours = hourlyProductivity.filter(h => h.hour < 21);

    if (lateHours.length === 0 || earlyHours.length === 0) return null;

    const avgLate = lateHours.reduce((s, h) => s + h.totalMinutes, 0) / lateHours.length;
    const avgEarly = earlyHours.reduce((s, h) => s + h.totalMinutes, 0) / earlyHours.length;

    return {
        peakHour: peakHour.hour,
        dropsAfter9pm: avgLate < avgEarly * 0.5,
        avgLateMinutes: Math.round(avgLate),
        avgEarlyMinutes: Math.round(avgEarly),
    };
}

/**
 * Run all pattern detectors and store discovered habits.
 */
function analyzeAndStorePatterns() {
    const logs = db.getActivityLogs(200);
    if (logs.length < 5) return []; // not enough data

    const habits = [];

    // Productive hours
    const prodHours = detectProductiveHours(logs);
    if (prodHours.length > 0) {
        const peak = prodHours[0];
        const label = peak.hour >= 20 ? 'night_worker' : peak.hour >= 12 ? 'afternoon_worker' : 'morning_worker';
        const desc = `Most productive around ${peak.hour}:00 (${peak.totalMinutes} total minutes across ${peak.sessionCount} sessions)`;
        const confidence = Math.min(peak.sessionCount / 15, 0.95);
        db.addHabit(label, desc, confidence);
        habits.push({ name: label, description: desc, confidence });
    }

    // Weekend skipping
    const weekendData = detectWeekendSkipping(logs);
    if (weekendData && weekendData.skipsWeekends) {
        db.addHabit('weekend_skipper', `Only ${weekendData.weekendRatio}% of activity happens on weekends`, weekendData.confidence);
        habits.push({ name: 'weekend_skipper', description: `Skips weekends`, confidence: weekendData.confidence });
    }

    // Focus dropoff
    const focusData = detectFocusDropoff(logs);
    if (focusData && focusData.dropsAfter9pm) {
        db.addHabit('late_focus_drop', `Productivity drops significantly after 9pm`, 0.7);
        habits.push({ name: 'late_focus_drop', description: 'Loses focus after 9pm', confidence: 0.7 });
    }

    // Streaks
    const streaks = detectStreaks(logs);
    if (streaks.longestStreak >= 3) {
        db.addHabit('streak_builder', `Longest streak: ${streaks.longestStreak} days, current: ${streaks.currentStreak} days`, Math.min(streaks.longestStreak / 10, 0.95));
        habits.push({ name: 'streak_builder', description: `Best streak: ${streaks.longestStreak}d`, confidence: Math.min(streaks.longestStreak / 10, 0.95) });
    }

    return habits;
}

module.exports = {
    detectProductiveHours,
    detectInactivityGaps,
    detectWeekendSkipping,
    detectStreaks,
    detectFocusDropoff,
    analyzeAndStorePatterns,
};
