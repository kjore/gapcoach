function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

export function localTs(withMs = false) {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const ms = withMs ? `.${pad(d.getMilliseconds(), 3)}` : "";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${ms}` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  );
}

export function dateMinute() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minuteStamp() {
  const d = new Date();
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
