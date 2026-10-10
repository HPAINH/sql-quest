
const DAY = 86400000;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const ts = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const dt = (ms) => ts(ms).slice(0, 10);
const U = (y, m, d) => Date.UTC(y, m - 1, d);

const MALE = ['Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил', 'Никита', 'Матвей', 'Роман', 'Егор', 'Иван', 'Павел', 'Тимур', 'Руслан', 'Глеб', 'Денис'];
const FEMALE = ['Анна', 'Мария', 'Елена', 'Дарья', 'Алина', 'Ирина', 'Екатерина', 'Ольга', 'Наталья', 'Полина', 'Софья', 'Виктория', 'Ксения', 'Юлия', 'Вероника', 'Алиса', 'Татьяна', 'Евгения', 'Маргарита', 'Диана'];
const SURN = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов', 'Михайлов', 'Новиков', 'Фёдоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев', 'Семёнов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов', 'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Соловьёв', 'Борисов', 'Яковлев', 'Григорьев'];
const SURN_NEUTRAL = ['Ким', 'Шевченко', 'Бондаренко', 'Ткаченко', 'Гаджиев', 'Мельник', 'Цой', 'Коваль'];
const CITIES = [['Москва', 30], ['Санкт-Петербург', 15], ['Казань', 8], ['Новосибирск', 7], ['Екатеринбург', 7], ['Нижний Новгород', 6], ['Самара', 5], ['Краснодар', 6], ['Пермь', 4], ['Воронеж', 4], ['Ростов-на-Дону', 5], ['Уфа', 3]];
const DOMAINS = [['mail.ru', 30], ['yandex.ru', 30], ['gmail.com', 25], ['bk.ru', 8], ['inbox.ru', 7]];
const STREETS = ['Ленина', 'Гагарина', 'Мира', 'Советская', 'Садовая', 'Пушкина', 'Лесная', 'Школьная', 'Набережная', 'Молодёжная', 'Центральная', 'Победы'];

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (s) => s.toLowerCase().split('').map((c) => TR[c] ?? c).join('');

const CATEGORIES = [
  [1, 'Электроника', null], [2, 'Дом и кухня', null], [3, 'Одежда и обувь', null], [4, 'Спорт и отдых', null], [5, 'Книги', null], [6, 'Красота', null],
  [7, 'Смартфоны', 1], [8, 'Ноутбуки', 1], [9, 'Наушники', 1], [10, 'Аксессуары', 1],
  [11, 'Посуда', 2], [12, 'Текстиль', 2], [13, 'Освещение', 2],
  [14, 'Мужская одежда', 3], [15, 'Женская одежда', 3], [16, 'Обувь', 3],
  [17, 'Фитнес', 4], [18, 'Туризм', 4], [19, 'Велоспорт', 4],
  [20, 'Художественная литература', 5], [21, 'Нон-фикшн', 5], [22, 'Детские книги', 5],
  [23, 'Уход за кожей', 6], [24, 'Парфюмерия', 6],
  [25, 'Игровые смартфоны', 7],
];
const LEAF = {
  7: [['Смартфон'], ['Nova', 'Orbit', 'Kvant', 'Pixelo'], [12000, 95000]],
  25: [['Игровой смартфон'], ['Kvant', 'Rogue'], [45000, 120000]],
  8: [['Ноутбук', 'Ультрабук'], ['Kvant', 'Lumen', 'Atlas'], [38000, 210000]],
  9: [['Наушники', 'TWS-наушники'], ['Sonic', 'Nova', 'Echo'], [1500, 32000]],
  10: [['Чехол', 'Зарядка', 'Кабель USB-C', 'Пауэрбанк'], ['Nova', 'Volt', 'Echo'], [300, 6500]],
  11: [['Сковорода', 'Кастрюля', 'Набор ножей', 'Чайник'], ['Домовит', 'Stahl', 'Kraft'], [700, 14000]],
  12: [['Плед', 'Комплект постельного белья', 'Полотенце'], ['Лён&Ко', 'Уют', 'Nord'], [600, 9000]],
  13: [['Настольная лампа', 'Торшер', 'Гирлянда'], ['Lumen', 'Свет+', 'Nord'], [900, 16000]],
  14: [['Футболка', 'Худи', 'Джинсы', 'Куртка'], ['Basic', 'Urban', 'Северный ветер'], [900, 18000]],
  15: [['Платье', 'Свитер', 'Юбка', 'Пальто'], ['Basic', 'Мода', 'Urban'], [1200, 24000]],
  16: [['Кроссовки', 'Ботинки', 'Кеды'], ['Stride', 'Urban', 'Тропа'], [2500, 19000]],
  17: [['Гантели', 'Коврик для йоги', 'Фитнес-браслет'], ['Сила', 'Flex', 'Pulse'], [700, 12000]],
  18: [['Палатка', 'Рюкзак', 'Спальник'], ['Тропа', 'Nord', 'Алтай'], [2500, 38000]],
  19: [['Велосипед', 'Велошлем', 'Велофонарь'], ['Stride', 'Тропа', 'Volt'], [900, 75000]],
  20: [['Роман', 'Сборник рассказов'], ['Эксмо', 'АСТ', 'Азбука'], [350, 1400]],
  21: [['Книга по аналитике', 'Книга по SQL', 'Книга о бизнесе'], ['МИФ', 'Питер', 'Альпина'], [600, 2600]],
  22: [['Детская книга', 'Энциклопедия'], ['Росмэн', 'Махаон', 'МИФ'], [300, 1800]],
  23: [['Крем', 'Сыворотка', 'Маска для лица'], ['Аура', 'Derma', 'Лён&Ко'], [350, 4800]],
  24: [['Парфюмерная вода', 'Туалетная вода'], ['Aroma', 'Аура', 'Noir'], [1900, 15000]],
};
const DEPTS = ['Продажи', 'Маркетинг', 'Логистика', 'Аналитика', 'Поддержка'];
const COURIERS = [['СДЭК', 35], ['Почта России', 20], ['Boxberry', 20], ['Собственная доставка', 25]];
const METHODS = [['card', 55], ['sbp', 25], ['cash_on_delivery', 12], ['installments', 8]];
const REVIEW_TEXT = {
  5: ['Отличный товар, рекомендую', 'Всё супер, доставили быстро', 'Полностью доволен покупкой', 'Лучшее за свои деньги'],
  4: ['Хороший товар, есть мелкие недочёты', 'В целом доволен', 'Соответствует описанию'],
  3: ['Нормально, но ожидал большего', 'Средне', 'Качество так себе'],
  2: ['Быстро сломался', 'Не соответствует описанию', 'Разочарован'],
  1: ['Ужасно, верну обратно', 'Пришёл брак', 'Не рекомендую'],
};

export function generate(seed = 1, scale = 1) {
  const rnd = mulberry32(seed * 7919 + 13);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const wpick = (pairs) => {
    const tot = pairs.reduce((s, p) => s + p[1], 0);
    let r = rnd() * tot;
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const money = (x) => Math.round(x * 100) / 100;
  const N = (n) => Math.round(n * scale);
  const hidden = seed !== 1;
  const cities = hidden ? [...CITIES, ['Тюмень', 3]] : CITIES;
  const domains = hidden ? [...DOMAINS, ['rambler.ru', 4]] : DOMAINS;

  const T = {};
  const table = (name, columns) => (T[name] = { columns, rows: [] });

  const categories = table('categories', ['category_id', 'name', 'parent_id']);
  for (const c of CATEGORIES) categories.rows.push(c);
  if (hidden) categories.rows.push([26, 'Умный дом', 2]);

  const customers = table('customers', ['customer_id', 'first_name', 'last_name', 'email', 'phone', 'city', 'registered_at', 'birth_date']);
  const nCust = N(2000);
  const emails = [];
  const regStart = U(2023, 1, 1), regEnd = U(2026, 6, 30);
  for (let id = 1; id <= nCust; id++) {
    const female = chance(0.52);
    const first = female ? pick(FEMALE) : pick(MALE);
    let last = chance(0.08) ? pick(SURN_NEUTRAL) : pick(SURN);
    if (female && !SURN_NEUTRAL.includes(last)) last = last + 'а';
    let email = `${translit(first)}.${translit(last)}${chance(0.6) ? int(1, 999) : ''}@${wpick(domains)}`;
    if (emails.length > 50 && chance(0.012)) {
      const src = pick(emails);
      email = src.charAt(0).toUpperCase() + src.slice(1).replace('@', '@').replace(/\.(ru|com)$/, (m) => m.toUpperCase());
    }
    emails.push(email);
    const phone = chance(0.3) ? null : `+7 9${int(0, 9)}${int(0, 9)} ${int(100, 999)}-${pad(int(0, 99))}-${pad(int(0, 99))}`;
    const u = Math.sqrt(rnd());
    const reg = regStart + Math.floor(u * (regEnd - regStart)) + int(0, DAY / 1000 - 1) * 1000;
    const birth = chance(0.15) ? null : dt(U(1965, 1, 1) + Math.floor(rnd() * (U(2007, 12, 31) - U(1965, 1, 1))));
    customers.rows.push([id, first, last, email, phone, wpick(cities), ts(reg), birth]);
  }

  const products = table('products', ['product_id', 'category_id', 'name', 'brand', 'price', 'cost', 'is_active', 'created_at']);
  const leaf = hidden ? { ...LEAF, 26: [['Умная колонка', 'Умная лампа'], ['Zenit', 'Domio'], [1900, 14000]] } : LEAF;
  const leafIds = Object.keys(leaf).map(Number);
  const nProd = N(500);
  const prodNames = new Set();
  for (let id = 1; id <= nProd; id++) {
    const cat = leafIds[(id - 1) % leafIds.length];
    const [kinds, brands, [lo, hi]] = leaf[cat];
    const kind = pick(kinds), brand = pick(brands);
    let name;
    do { name = `${kind} ${brand} ${pick(['Lite', 'Pro', 'Max', 'Air', 'Mini', 'Plus', 'X', 'S', 'One', 'Neo'])}${int(1, 30)}`; } while (prodNames.has(name));
    prodNames.add(name);
    const price = money(Math.round((lo + Math.pow(rnd(), 1.6) * (hi - lo)) / 10) * 10 - (chance(0.5) ? 1 : 0));
    const cost = money(price * (0.5 + rnd() * 0.25));
    products.rows.push([id, cat, name, brand, price, cost, chance(0.9), dt(U(2023, 1, 1) + Math.floor(rnd() * (U(2026, 5, 1) - U(2023, 1, 1))))]);
  }
  const neverSold = new Set();
  while (neverSold.size < Math.round(nProd * 0.08)) neverSold.add(int(1, nProd));
  const sellable = products.rows.filter((p) => !neverSold.has(p[0]));
  const popW = sellable.map((p) => [p, 1 + Math.pow(rnd(), 3) * 20]);

  const promo = table('promo_codes', ['code', 'discount_pct', 'valid_from', 'valid_to']);
  const PROMO_NAMES = ['WELCOME', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'BLACKFRIDAY', 'NEWYEAR', 'SALE', 'VIP', 'SQL'];
  const promoList = [];
  for (let i = 0; i < 30; i++) {
    const pct = pick([5, 7, 10, 10, 15, 15, 20, 25, 30]);
    const code = `${PROMO_NAMES[i % PROMO_NAMES.length]}${pct}${i >= PROMO_NAMES.length ? '_' + (2024 + Math.floor(i / 10)) : ''}`;
    const from = U(2024, 1, 1) + Math.floor(rnd() * (U(2026, 5, 1) - U(2024, 1, 1)));
    const to = from + int(14, 120) * DAY;
    promoList.push({ code, pct, from, to });
    promo.rows.push([code, pct, dt(from), dt(to)]);
  }

  const orders = table('orders', ['order_id', 'customer_id', 'created_at', 'status', 'delivery_city', 'delivery_address', 'amount']);
  const items = table('order_items', ['order_id', 'product_id', 'quantity', 'price']);
  const payments = table('payments', ['payment_id', 'order_id', 'amount', 'paid_at', 'method']);
  const deliveries = table('deliveries', ['order_id', 'shipped_at', 'delivered_at', 'courier']);
  const orderPromos = table('order_promos', ['order_id', 'code']);
  const nOrders = N(6000);
  const buyers = customers.rows.filter(() => chance(0.92));
  const buyerW = buyers.map((c) => [c, 1 + Math.pow(rnd(), 4) * 12]);
  const ordStart = U(2024, 1, 1), ordEnd = U(2026, 6, 30) + DAY - 1000;
  const fulfilled = [];
  let payId = 1;
  for (let i = 0; i < nOrders; i++) {
    const c = wpick(buyerW);
    const reg = Date.parse(c[6].replace(' ', 'T') + 'Z');
    const start = Math.max(reg, ordStart);
    if (start >= ordEnd) continue;
    let created = start + Math.floor(rnd() * (ordEnd - start));
    if (chance(0.12)) {
      const y = new Date(created).getUTCFullYear();
      const s = Date.UTC(y, 10, 1) + int(0, 60) * DAY + int(0, 86399) * 1000;
      if (s > start && s < ordEnd) created = s;
    }
    orders.rows.push({ c, created });
  }
  orders.rows.sort((a, b) => a.created - b.created);
  const now = U(2026, 7, 1);
  orders.rows = orders.rows.map((o, idx) => {
    const id = idx + 1;
    const age = (now - o.created) / DAY;
    let status;
    const r = rnd();
    if (r < 0.07) status = 'cancelled';
    else if (r < 0.1) status = age > 10 ? 'returned' : 'delivered';
    else if (age < 2) status = pick(['new', 'paid']);
    else if (age < 7) status = pick(['paid', 'shipped', 'shipped', 'delivered']);
    else status = chance(0.01) ? 'shipped' : 'delivered';
    const city = chance(0.9) ? o.c[5] : wpick(cities);
    const addr = chance(0.012) ? null : `ул. ${pick(STREETS)}, д. ${int(1, 120)}${chance(0.7) ? `, кв. ${int(1, 300)}` : ''}`;
    const nItems = wpick([[1, 45], [2, 28], [3, 15], [4, 8], [5, 4]]);
    const used = new Set();
    let sum = 0;
    for (let k = 0; k < nItems; k++) {
      const p = wpick(popW);
      if (used.has(p[0])) continue;
      used.add(p[0]);
      const qty = wpick([[1, 75], [2, 18], [3, 7]]);
      const price = chance(0.15) ? money(Math.round(p[4] * 0.9)) : p[4];
      items.rows.push([id, p[0], qty, price]);
      sum += qty * price;
    }
    let amount = money(sum);
    if (chance(0.25)) {
      const valid = promoList.filter((pr) => o.created >= pr.from && o.created <= pr.to);
      if (valid.length) {
        const pr = pick(valid);
        orderPromos.rows.push([id, pr.code]);
        amount = money(sum * (1 - pr.pct / 100));
      }
    }
    if (chance(0.005)) amount = 0;
    if (!['new', 'cancelled'].includes(status) && amount > 0) {
      const method = wpick(METHODS);
      const paidAt = o.created + int(1, 90) * 60000;
      if (chance(0.03)) {
        const part = money(Math.round(amount * 0.4));
        payments.rows.push([payId++, id, part, ts(paidAt), method]);
        payments.rows.push([payId++, id, money(amount - part), ts(paidAt + int(1, 5) * DAY), method]);
      } else payments.rows.push([payId++, id, amount, ts(paidAt), method]);
    }
    if (['shipped', 'delivered', 'returned'].includes(status)) {
      const shipped = o.created + int(12, 72) * 3600000;
      const fast = city === 'Москва' || city === 'Санкт-Петербург';
      const delivered = status === 'shipped' ? null : shipped + int(fast ? 10 : 24, fast ? 72 : 190) * 3600000;
      deliveries.rows.push([id, ts(shipped), delivered ? ts(delivered) : null, wpick(COURIERS)]);
      if (status === 'delivered') fulfilled.push({ id, c: o.c, delivered, products: [...used] });
    }
    return [id, o.c[0], ts(o.created), status, city, addr, amount];
  });

  const reviews = table('reviews', ['review_id', 'product_id', 'customer_id', 'rating', 'text', 'created_at']);
  const nRev = N(1500);
  const seenRev = new Set();
  for (let i = 0, id = 1; id <= nRev && i < nRev * 5; i++) {
    const f = pick(fulfilled);
    const pid = pick(f.products);
    const key = f.c[0] + ':' + pid;
    if (seenRev.has(key)) continue;
    seenRev.add(key);
    const rating = wpick([[5, 45], [4, 25], [3, 12], [2, 8], [1, 10]]);
    const created = Math.min(f.delivered + int(1, 20) * DAY + int(0, 86399) * 1000, U(2026, 6, 30) + DAY - 1000);
    reviews.rows.push([id++, pid, f.c[0], rating, chance(0.4) ? null : pick(REVIEW_TEXT[rating]), ts(created)]);
  }

  const employees = table('employees', ['employee_id', 'full_name', 'manager_id', 'department', 'position', 'hired_at', 'salary']);
  const person = () => {
    const f = chance(0.5);
    let l = pick(SURN); if (f) l += 'а';
    return `${f ? pick(FEMALE) : pick(MALE)} ${l}`;
  };
  employees.rows.push([1, person(), null, 'Руководство', 'Генеральный директор', dt(U(2018, 3, 1)), 650000]);
  let eid = 2;
  const heads = {};
  for (const d of DEPTS) {
    heads[d] = eid;
    employees.rows.push([eid++, person(), 1, d, 'Руководитель направления', dt(U(2018, 6, 1) + int(0, 900) * DAY), int(28, 42) * 10000]);
  }
  const leads = {};
  for (const d of DEPTS) {
    leads[d] = [];
    for (let k = 0; k < 2; k++) {
      leads[d].push(eid);
      employees.rows.push([eid++, person(), heads[d], d, 'Тимлид', dt(U(2019, 1, 1) + int(0, 1500) * DAY), int(20, 28) * 10000]);
    }
  }
  const POS = { Продажи: 'Менеджер по продажам', Маркетинг: 'Маркетолог', Логистика: 'Логист', Аналитика: 'Аналитик данных', Поддержка: 'Специалист поддержки' };
  while (eid <= 60) {
    const d = pick(DEPTS);
    const hired = U(2020, 1, 1) + int(0, 2350) * DAY;
    employees.rows.push([eid++, person(), pick(leads[d]), d, (chance(0.25) ? 'Старший ' + POS[d].charAt(0).toLowerCase() + POS[d].slice(1) : POS[d]), dt(hired), int(8, 19) * 10000]);
  }

  const warehouses = table('warehouses', ['warehouse_id', 'name', 'city']);
  [['Склад Центральный', 'Москва'], ['Склад Северный', 'Санкт-Петербург'], ['Склад Волга', 'Казань'], ['Склад Сибирь', 'Новосибирск'], ['Склад Урал', 'Екатеринбург'], ...(hidden ? [['Склад Юг', 'Краснодар']] : [])]
    .forEach(([n, c], i) => warehouses.rows.push([i + 1, n, c]));
  const stock = table('stock', ['warehouse_id', 'product_id', 'qty', 'updated_at']);
  for (const p of products.rows) {
    for (let w = 1; w <= warehouses.rows.length; w++) {
      if (w === 1 || chance(0.55)) stock.rows.push([w, p[0], chance(0.1) ? 0 : int(1, 200), ts(U(2026, 5, 1) + int(0, 60 * 86400 - 1) * 1000)]);
    }
  }

  const events = table('events', ['event_id', 'customer_id', 'session_id', 'event_type', 'event_ts', 'props']);
  let evId = 1, sess = 1;
  const nSess = N(2500);
  for (let s = 0; s < nSess; s++) {
    const c = pick(customers.rows);
    let t = U(2026, 1, 1) + Math.floor(rnd() * (U(2026, 6, 30) - U(2026, 1, 1)));
    const pid = pick(sellable)[0];
    const steps = ['view', 'add_to_cart', 'checkout', 'purchase'];
    const depth = wpick([[1, 55], [2, 22], [3, 10], [4, 13]]);
    for (let k = 0; k < depth; k++) {
      t += int(5, 600) * 1000;
      events.rows.push([evId++, c[0], sess, steps[k], ts(t), JSON.stringify({ product_id: pid, device: pick(['mobile', 'mobile', 'desktop', 'tablet']) })]);
    }
    sess++;
  }
  const ab = table('ab_assignments', ['customer_id', 'experiment', 'variant', 'assigned_at']);
  for (const c of customers.rows) if (chance(0.5)) ab.rows.push([c[0], 'new_checkout', chance(0.5) ? 'A' : 'B', ts(U(2026, 3, 1) + int(0, 86 * 86400) * 1000)]);

  return T;
}

export const DDL = (s) => `
CREATE SCHEMA IF NOT EXISTS ${s};
CREATE TABLE ${s}.categories (category_id int PRIMARY KEY, name text NOT NULL, parent_id int REFERENCES ${s}.categories);
CREATE TABLE ${s}.customers (customer_id int PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL, email text NOT NULL, phone text, city text NOT NULL, registered_at timestamp NOT NULL, birth_date date);
CREATE TABLE ${s}.products (product_id int PRIMARY KEY, category_id int NOT NULL REFERENCES ${s}.categories, name text NOT NULL, brand text NOT NULL, price numeric(10,2) NOT NULL, cost numeric(10,2) NOT NULL, is_active boolean NOT NULL, created_at date NOT NULL);
CREATE TABLE ${s}.promo_codes (code text PRIMARY KEY, discount_pct int NOT NULL, valid_from date NOT NULL, valid_to date NOT NULL);
CREATE TABLE ${s}.orders (order_id int PRIMARY KEY, customer_id int NOT NULL REFERENCES ${s}.customers, created_at timestamp NOT NULL, status text NOT NULL, delivery_city text NOT NULL, delivery_address text, amount numeric(12,2) NOT NULL);
CREATE TABLE ${s}.order_items (order_id int NOT NULL REFERENCES ${s}.orders, product_id int NOT NULL REFERENCES ${s}.products, quantity int NOT NULL, price numeric(10,2) NOT NULL, PRIMARY KEY (order_id, product_id));
CREATE TABLE ${s}.payments (payment_id int PRIMARY KEY, order_id int NOT NULL REFERENCES ${s}.orders, amount numeric(12,2) NOT NULL, paid_at timestamp NOT NULL, method text NOT NULL);
CREATE TABLE ${s}.deliveries (order_id int PRIMARY KEY REFERENCES ${s}.orders, shipped_at timestamp NOT NULL, delivered_at timestamp, courier text NOT NULL);
CREATE TABLE ${s}.order_promos (order_id int PRIMARY KEY REFERENCES ${s}.orders, code text NOT NULL REFERENCES ${s}.promo_codes);
CREATE TABLE ${s}.reviews (review_id int PRIMARY KEY, product_id int NOT NULL REFERENCES ${s}.products, customer_id int NOT NULL REFERENCES ${s}.customers, rating int NOT NULL, text text, created_at timestamp NOT NULL);
CREATE TABLE ${s}.employees (employee_id int PRIMARY KEY, full_name text NOT NULL, manager_id int REFERENCES ${s}.employees, department text NOT NULL, position text NOT NULL, hired_at date NOT NULL, salary numeric(10,2) NOT NULL);
CREATE TABLE ${s}.warehouses (warehouse_id int PRIMARY KEY, name text NOT NULL, city text NOT NULL);
CREATE TABLE ${s}.stock (warehouse_id int NOT NULL REFERENCES ${s}.warehouses, product_id int NOT NULL REFERENCES ${s}.products, qty int NOT NULL, updated_at timestamp NOT NULL, PRIMARY KEY (warehouse_id, product_id));
CREATE TABLE ${s}.events (event_id int PRIMARY KEY, customer_id int NOT NULL REFERENCES ${s}.customers, session_id int NOT NULL, event_type text NOT NULL, event_ts timestamp NOT NULL, props jsonb);
CREATE TABLE ${s}.ab_assignments (customer_id int NOT NULL REFERENCES ${s}.customers, experiment text NOT NULL, variant text NOT NULL, assigned_at timestamp NOT NULL, PRIMARY KEY (customer_id, experiment));
`;

export const TABLE_ORDER = ['categories', 'customers', 'products', 'promo_codes', 'orders', 'order_items', 'payments', 'deliveries', 'order_promos', 'reviews', 'employees', 'warehouses', 'stock', 'events', 'ab_assignments'];

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return "'" + String(v).replace(/'/g, "''") + "'";
};

export async function loadInto(db, schema, T) {
  await db.exec(DDL(schema));
  for (const name of TABLE_ORDER) {
    const { columns, rows } = T[name];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => '(' + r.map(lit).join(',') + ')').join(',\n');
      await db.exec(`INSERT INTO ${schema}.${name} (${columns.join(',')}) VALUES ${chunk};`);
    }
  }
}
