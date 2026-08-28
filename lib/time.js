function isSameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeAgo(dateString) {
  const then = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 3) return `${hours}h ago`;

  // Past 3 hours, a precise elapsed count stops being useful and starts
  // reading as staleness (e.g. on a slow scan day) even when the listing
  // is still perfectly real and active - "Today"/"Yesterday" stays
  // completely honest (it really was found that calendar day) without
  // implying anything is wrong.
  if (isSameCalendarDay(then, now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(then, yesterday)) return "Yesterday";

  return `${Math.round(hours / 24)}d ago`;
}

function timeUntil(dateString) {
  const ms = new Date(dateString).getTime() - Date.now();
  if (ms <= 0) return "ending soon";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
}

// True when `dateString` is within `ms` of now. Kept here (rather than
// inline in a component) so the Date.now() call sits in a plain module,
// not a component body.
function isWithin(dateString, ms) {
  if (!dateString) return false;
  return Date.now() - new Date(dateString).getTime() < ms;
}

module.exports = { timeAgo, timeUntil, isWithin };
