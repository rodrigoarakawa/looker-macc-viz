/**
 * MACC (Marginal Abatement Cost Curve) - Community Visualization para Looker Studio
 * IMPORTANTE: este arquivo deve ser concatenado DEPOIS de dscc.min.js para formar o macc.bundle.js
 *
 * Campos esperados:
 *  - DIMENSION: actionDim (Ação/Medida)
 *  - METRIC:    abatementMetric (Abatimento, p.ex., tCO2e)
 *  - METRIC:    costMetric (Custo marginal, p.ex., R$/tCO2e)
 *  - DIMENSION: categoryDim (opcional)
 *
 * Estilos:
 *  - posColor, negColor, axisColor, showLabels, currency, unit, decimals
 *
 * Interação:
 *  - Clique → FILTER por actionDim (se habilitada no relatório)
 */

(function () {
  // Helpers ------------------------------------------------------------
  function clear(el){ while (el && el.firstChild) el.removeChild(el.firstChild); }
  function fmtNumber(x, decimals){
    if (x === null || x === undefined || isNaN(x)) return "";
    const f = Number(x);
    return f.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
  }
  function getStyle(styleObj, key, fallback){
    try {
      const v = styleObj[key];
      if (!v) return fallback;
      return (v.value !== undefined && v.value !== null) ? v.value : (v.defaultValue ?? fallback);
    } catch(e){ return fallback; }
  }

  // Tooltip básico -----------------------------------------------------
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    padding: '6px 8px',
    font: '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,.15)',
    background: 'rgba(0,0,0,.8)',
    color: 'white',
    zIndex: '999999',
    visibility: 'hidden'
  });
  document.body.appendChild(tooltip);
  function showTooltip(html, x, y){
    tooltip.innerHTML = html;
    tooltip.style.left = (x + 12) + 'px';
    tooltip.style.top  = (y + 12) + 'px';
    tooltip.style.visibility = 'visible';
  }
  function hideTooltip(){ tooltip.style.visibility = 'hidden'; }

  // Root container -----------------------------------------------------
  const rootId = 'macc-root';
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.createElement('div');
    root.id = rootId;
    root.style.width = '100%';
    root.style.height = '100%';
    document.body.appendChild(root);
  }

  // Desenho principal --------------------------------------------------
  function draw(data) {
    const width  = dscc.getWidth ? dscc.getWidth()  : (root.clientWidth  || 600);
    const height = dscc.getHeight ? dscc.getHeight() : (root.clientHeight || 400);
    clear(root);

    const m = { top: 28, right: 20, bottom: 38, left: 60 };
    const W = Math.max(100, width  - m.left - m.right);
    const H = Math.max(80,  height - m.top  - m.bottom);

    // Estilos
    const styles    = data.style || {};
    const posColor  = getStyle(styles, 'posColor',  {color:'#4C78A8'}).color || '#4C78A8';
    const negColor  = getStyle(styles, 'negColor',  {color:'#72B7B2'}).color || '#72B7B2';
    const axisColor = getStyle(styles, 'axisColor', {color:'#333333'}).color || '#333333';
    const showLabels= getStyle(styles, 'showLabels', true);
    const currency  = getStyle(styles, 'currency', 'R$');
    const unit      = getStyle(styles, 'unit', 'tCO2e');
    const decimals  = Number(getStyle(styles, 'decimals', 2)) || 2;

    // IDs de campo (para interação)
    const fields = data.fields || {};
    const actionFields  = fields['actionDim'] || [];
    const actionFieldId = actionFields.length ? actionFields[0].id : null;

    // Linhas (objectTransform)
    const rows = (data.tables && data.tables.DEFAULT) ? data.tables.DEFAULT : [];
    const items = rows.map(r => ({
      action:    (r.actionDim       && r.actionDim[0])       ?? '—',
      abatement: Number((r.abatementMetric && r.abatementMetric[0]) ?? 0),
      cost:      Number((r.costMetric      && r.costMetric[0])      ?? 0),
      category:  (r.categoryDim     && r.categoryDim[0])     ?? null
    })).filter(d => isFinite(d.abatement) && d.abatement > 0);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:14px/1.2 system-ui;color:#666;text-align:center;padding:12px;';
      empty.textContent = 'Adicione campos válidos: Ação (dimensão), Abatimento (>0, métrica) e Custo marginal (métrica).';
      root.appendChild(empty);
      return;
    }

    // Ordenação por custo ascendente
    items.sort((a,b) => a.cost - b.cost);

    // Acumulado do abatimento (largura)
    const totalAbatement = items.reduce((s,d) => s + d.abatement, 0);
    let acc = 0;
    items.forEach(d => { d.x0 = acc; d.x1 = acc + d.abatement; acc = d.x1; });

    // Domínio Y inclui zero
    const minCost = Math.min(0, ...items.map(d => d.cost));
    const maxCost = Math.max(0, ...items.map(d => d.cost));

    // Escalas
    const xScale = (v) => m.left + (v / totalAbatement) * W;
    const yScale = (v) => m.top + (H - (v - minCost) / (maxCost - minCost || 1) * H);
    const yZero  = yScale(0);

    // SVG
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.font = '12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    root.appendChild(svg);

    // Eixo X (linha base)
    const axisGroup = document.createElementNS(svgNS, 'g'); svg.appendChild(axisGroup);
    const xAxis = document.createElementNS(svgNS, 'line');
    xAxis.setAttribute('x1', m.left); xAxis.setAttribute('y1', yZero);
    xAxis.setAttribute('x2', m.left + W); xAxis.setAttribute('y2', yZero);
    xAxis.setAttribute('stroke', axisColor); xAxis.setAttribute('stroke-width', '1');
    axisGroup.appendChild(xAxis);

    // Ticks X
    const xTicks = 6;
    for (let i=0;i<=xTicks;i++){
      const t = (totalAbatement / xTicks) * i;
      const x = xScale(t);
      const tick = document.createElementNS(svgNS, 'line');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', yZero); tick.setAttribute('y2', yZero + 5);
      tick.setAttribute('stroke', axisColor);
      axisGroup.appendChild(tick);

      const lbl = document.createElementNS(svgNS, 'text');
      lbl.setAttribute('x', x); lbl.setAttribute('y', yZero + 18);
      lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('fill', axisColor);
      lbl.textContent = fmtNumber(t, 0) + ' ' + unit;
      axisGroup.appendChild(lbl);
    }

    // Ticks Y + grades
    const yTicks = 5;
    for (let i=0;i<=yTicks;i++){
      const v = minCost + (i / yTicks) * (maxCost - minCost);
      const y = yScale(v);
      const grid = document.createElementNS(svgNS, 'line');
      grid.setAttribute('x1', m.left); grid.setAttribute('x2', m.left + W);
      grid.setAttribute('y1', y); grid.setAttribute('y2', y);
      grid.setAttribute('stroke', 'rgba(0,0,0,.08)');
      svg.appendChild(grid);

      const lbl = document.createElementNS(svgNS, 'text');
      lbl.setAttribute('x', m.left - 8); lbl.setAttribute('y', y + 4);
      lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('fill', axisColor);
      lbl.textContent = currency + ' ' + fmtNumber(v, decimals) + '/t';
      svg.appendChild(lbl);
    }

    // Barras
    const barGroup = document.createElementNS(svgNS, 'g'); svg.appendChild(barGroup);
    const FILTER = dscc.InteractionType && dscc.InteractionType.FILTER;

    items.forEach(d => {
      const x  = xScale(d.x0);
      const x2 = xScale(d.x1);
      const w  = Math.max(1, x2 - x);
      const y  = d.cost >= 0 ? yScale(d.cost) : yZero;
      const h  = Math.max(1, Math.abs(yScale(d.cost) - yZero));
      const fill = d.cost >= 0 ? posColor : negColor;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.s
