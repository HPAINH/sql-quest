export function parsePlan(raw) {
  const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const root = Array.isArray(json) ? json[0].Plan : json.Plan;
  return root;
}

export function flattenPlan(root) {
  const out = [];
  const walk = (n, depth) => {
    out.push({
      type: n['Node Type'],
      table: n['Relation Name'] || null,
      index: n['Index Name'] || null,
      cost: n['Total Cost'],
      rows: n['Plan Rows'],
      depth,
    });
    for (const c of n.Plans || []) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}

const matches = (node, rule) => new RegExp(`^(${rule.node})$`).test(node.type) && (!rule.table || node.table === rule.table);

export function describeRule(rule) {
  const kind = rule.node.split('|').join(' / ');
  return rule.table ? `${kind} по таблице ${rule.table}` : kind;
}

export function checkPlan(root, spec) {
  const nodes = flattenPlan(root);
  const cost = root['Total Cost'];
  for (const rule of spec.forbid || []) {
    const hit = nodes.find((n) => matches(n, rule));
    if (hit) return { ok: false, cost, nodes, message: `В плане есть ${describeRule(rule)} — именно его нужно убрать.` };
  }
  for (const rule of spec.require || []) {
    if (!nodes.some((n) => matches(n, rule))) return { ok: false, cost, nodes, message: `В плане нет ${describeRule(rule)}.` };
  }
  if (spec.max_cost != null && cost > spec.max_cost) {
    return { ok: false, cost, nodes, message: `Оценка стоимости плана ${fmt(cost)}, а нужно не больше ${fmt(spec.max_cost)}.` };
  }
  return { ok: true, cost, nodes };
}

export const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString('ru-RU');

export function describeSpec(spec) {
  const parts = [];
  for (const r of spec.forbid || []) parts.push(`без ${describeRule(r)}`);
  for (const r of spec.require || []) parts.push(`использовать ${describeRule(r)}`);
  if (spec.max_cost_ratio != null) parts.push(`стоимость плана минимум в ${fmt(1 / spec.max_cost_ratio)} раз ниже исходной`);
  else if (spec.max_cost != null) parts.push(`стоимость плана не больше ${fmt(spec.max_cost)}`);
  return parts;
}
