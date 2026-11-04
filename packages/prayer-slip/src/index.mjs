export const PRAYER_TYPES = Object.freeze(['peace', 'memorial']);
export const PRAYER_GENDERS = Object.freeze(['male', 'female']);
export const PRAYER_STATUSES = Object.freeze(['received', 'scheduled', 'completed']);

const STARS = Object.freeze({
  male: Object.freeze(['laHau', 'thoTu', 'thuyDieu', 'thaiBach', 'thaiDuong', 'vanHon', 'keDo', 'thaiAm', 'mocDuc']),
  female: Object.freeze(['keDo', 'vanHon', 'mocDuc', 'thaiAm', 'thoTu', 'laHau', 'thaiDuong', 'thaiBach', 'thuyDieu']),
});

const clean = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Cửu Diệu lặp theo chu kỳ 9 tuổi âm. Tuổi 1 và 10 cùng một sao.
export function starKeyForAge(age, gender) {
  if (!Number.isInteger(age) || age < 1 || age > 100 || !PRAYER_GENDERS.includes(gender)) return null;
  return STARS[gender][(age - 1) % 9];
}

// Tuổi âm theo cách tính phổ biến: năm hiện tại - năm sinh + 1.
export function ageForBirthYear(birthYear, year = new Date().getFullYear()) {
  if (!Number.isInteger(birthYear) || !Number.isInteger(year)) return null;
  const age = year - birthYear + 1;
  return age >= 1 && age <= 100 ? age : null;
}

export function normalizePrayerSlip(input, { year = new Date().getFullYear() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !PRAYER_TYPES.includes(input.type)) return null;
  if (!Array.isArray(input.people) || input.people.length < 1 || input.people.length > 10) return null;
  const people = [];
  for (const value of input.people) {
    const name = clean(value?.name, 80);
    const dharmaName = clean(value?.dharmaName, 80);
    const gender = value?.gender;
    // Chấp nhận trường age từ tab đã mở trước khi biểu mẫu đổi sang năm sinh.
    const birthYear = Number.isInteger(value?.birthYear)
      ? value.birthYear
      : Number.isInteger(value?.age) ? year - value.age + 1 : null;
    const age = ageForBirthYear(birthYear, year);
    if (!name || !PRAYER_GENDERS.includes(gender) || age === null) return null;
    people.push({ name, dharmaName, gender, birthYear, age, starKey: input.type === 'peace' ? starKeyForAge(age, gender) : null });
  }
  const requesterName = clean(input.requesterName, 80);
  const roomId = clean(input.roomId, 80);
  const state = clean(input.state, 8);
  const lang = clean(input.lang, 8);
  const note = clean(input.note, 500);
  if (!requesterName || !/^[a-z0-9-]{1,80}$/.test(roomId) || !/^[a-z]{2,3}$/.test(state) || !/^[a-z]{2}$/.test(lang)) return null;
  return { type: input.type, requesterName, roomId, state, lang, people, note };
}
