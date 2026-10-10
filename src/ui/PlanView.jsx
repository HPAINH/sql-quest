import { flattenPlan, fmt } from '../engine/plan.js';

const hit = (node, rules) => (rules || []).some((r) => new RegExp(`^(${r.node})$`).test(node.type) && (!r.table || node.table === r.table));

export default function PlanView({ root, spec, baseline, caption = 'План запроса' }) {
  if (!root) return null;
  const nodes = flattenPlan(root);
  const cost = root['Total Cost'];
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="rt-cap">{caption}</span>
        <span className="plan-cost">
          стоимость <b>{fmt(cost)}</b>
          {baseline ? <span className="muted"> · у исходного запроса {fmt(baseline)}{cost < baseline * 0.95 ? `, в ${fmt(baseline / Math.max(cost, 0.01))} раза дешевле` : cost > baseline * 1.05 ? ', стало дороже' : ', почти без изменений'}</span> : null}
        </span>
      </div>
      <ol className="plan-nodes">
        {nodes.map((n, i) => {
          const bad = hit(n, spec?.forbid);
          const good = hit(n, spec?.require);
          return (
            <li key={i} className={bad ? 'bad' : good ? 'good' : ''} style={{ paddingLeft: `${10 + n.depth * 18}px` }}>
              <span className="plan-type">{n.type}</span>
              {n.table && <span className="plan-table">{n.table}</span>}
              {n.index && <span className="plan-index">{n.index}</span>}
              <span className="plan-num">≈{n.rows} стр. · {fmt(n.cost)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
