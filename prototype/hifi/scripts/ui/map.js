(() => {
  "use strict";

  const data = window.HIFI_GEOGRAPHY;
  if (!data) throw new Error("缺少 HIFI_GEOGRAPHY");

  const BOUNDS = { lonMin: -12, lonMax: 43, latMin: 25, latMax: 62 };
  const VIEW = { w: 1050, h: 720, pad: 24 };
  const HEX_R = 12.8;
  const TERRAIN = {
    plains: ["平原", "#aabf79"],
    forest: ["森林", "#718b58"],
    hills: ["丘陵", "#9b8a6f"],
    mountains: ["山地", "#77736d"],
    desert: ["沙漠", "#c6a25f"],
    steppe: ["草原", "#aaa567"],
    wetland: ["湿地", "#648979"],
    coast: ["海岸", "#789c82"],
    sea: ["海域", "#356d7b"]
  };
  const CLIMATE = {
    temperate: "温带",
    mediterranean: "地中海",
    cold: "寒冷",
    arid: "干旱",
    alpine: "高山",
    ocean: "海洋"
  };
  const GOODS = {
    grain: ["谷物", "#d2b85d"],
    fish: ["鱼", "#6ba4b5"],
    wool: ["羊毛", "#bfb49a"],
    wine: ["葡萄酒", "#8e5064"],
    cloth: ["布匹", "#9b77aa"],
    salt: ["盐", "#d8d1bd"],
    iron: ["铁", "#777873"],
    silver: ["银", "#aebabb"],
    horses: ["马", "#ad7a49"],
    timber: ["木材", "#547a49"],
    gold: ["金", "#d09a2d"],
    spices: ["香料", "#bd6e3b"],
    dates: ["椰枣", "#b78b4e"]
  };
  const POLITY_COLORS = {
    "法兰西王国": "#315f9e",
    "英格兰王国": "#a64842",
    "英属加斯科涅": "#b85e47",
    "苏格兰王国": "#56795d",
    "布列塔尼公国": "#747986",
    "弗兰德斯伯国": "#ad7f3e",
    "神圣罗马帝国": "#b59f5c",
    "勃艮第公国": "#764e72",
    "米兰领": "#718b59",
    "威尼斯共和国": "#3f887c",
    "教皇国": "#bfb394",
    "那不勒斯王国": "#af6c50",
    "阿拉贡王国": "#bd8a38",
    "卡斯蒂利亚王国": "#a65343",
    "葡萄牙王国": "#4f7e5a",
    "格拉纳达酋长国": "#5f895d",
    "波兰王国": "#ae5a63",
    "立陶宛大公国": "#75643f",
    "条顿骑士团": "#aaa493",
    "匈牙利王国": "#a45565",
    "塞尔维亚王国": "#80679d",
    "拜占庭帝国": "#745797",
    "奥斯曼贝伊国": "#4f805f",
    "安纳托利亚诸贝伊国": "#809a53",
    "马林王朝": "#a18349",
    "特莱姆森王国": "#9d7040",
    "哈夫斯王朝": "#af824a",
    "马穆鲁克苏丹国": "#9d844b",
    "莫斯科公国": "#728154",
    "诺夫哥罗德共和国": "#638b8d",
    "金帐汗国": "#9d824f",
    "海域": "#356d7b"
  };

  const state = {
    mode: "political",
    selectedId: null,
    zoom: 1,
    centerX: VIEW.w / 2,
    centerY: VIEW.h / 2,
    dragged: false,
    dragStart: null
  };

  function project(lon, lat) {
    return {
      x: VIEW.pad + (lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin) * (VIEW.w - VIEW.pad * 2),
      y: VIEW.pad + (BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin) * (VIEW.h - VIEW.pad * 2)
    };
  }

  function unproject(x, y) {
    return {
      lon: BOUNDS.lonMin + (x - VIEW.pad) / (VIEW.w - VIEW.pad * 2) * (BOUNDS.lonMax - BOUNDS.lonMin),
      lat: BOUNDS.latMax - (y - VIEW.pad) / (VIEW.h - VIEW.pad * 2) * (BOUNDS.latMax - BOUNDS.latMin)
    };
  }

  function pointInPoly([x, y], poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const hit = ((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  function inAny(point, polygons) {
    return polygons.some(poly => pointInPoly(point, poly));
  }

  function isGibraltarStrait(lon, lat) {
    return lon > -6.25 && lon < -4.65 && lat > 35.65 && lat < 36.55;
  }

  function isConstantinopleTargetTile(lon, lat) {
    return lon > 26.9 && lon < 27.75 && lat > 39.35 && lat < 40.05;
  }

  function nearestSeed(lon, lat, sea) {
    let best = null;
    let distance = Infinity;
    for (const seed of data.regionSeeds) {
      const isSeaSeed = seed[3] === "sea";
      if (sea !== isSeaSeed) continue;
      const dx = (lon - seed[1]) * Math.cos(lat * Math.PI / 180);
      const dy = lat - seed[2];
      const next = dx * dx + dy * dy;
      if (next < distance) {
        distance = next;
        best = seed;
      }
    }
    return best;
  }

  function climateFor(lat, sea) {
    if (sea) return "ocean";
    if (lat > 55) return "cold";
    if (lat < 34) return "arid";
    if (lat < 45) return "mediterranean";
    return "temperate";
  }

  function terrainFor(lon, lat, seed, sea) {
    if (sea) return "sea";
    if (lat > 56) return lon > 10 ? "forest" : "hills";
    if (lat < 34 && lon < 25) return "desert";
    if ((lon > 5 && lon < 17 && lat > 43 && lat < 48) || (lon > 35 && lat > 39)) return "mountains";
    if (lon > 17 && lon < 28 && lat > 45 && lat < 52) return "steppe";
    return seed?.[3] || "plains";
  }

  function hexPoints(cx, cy, radius) {
    const points = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = Math.PI / 180 * (60 * index + 30);
      points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
    }
    return points.join(" ");
  }

  function buildTiles() {
    const tiles = [];
    const dx = HEX_R * 1.5;
    const dy = HEX_R * Math.sqrt(3);
    let id = 0;
    for (let row = 0, y = 30; y < VIEW.h - 18; row += 1, y += dy) {
      for (let x = 30 + (row % 2) * dx / 2; x < VIEW.w - 18; x += dx) {
        const geo = unproject(x, y);
        const strait = isGibraltarStrait(geo.lon, geo.lat);
        const constantinopleTarget = isConstantinopleTargetTile(geo.lon, geo.lat);
        const land = constantinopleTarget || (!strait && inAny([geo.lon, geo.lat], data.landPolygons));
        const sea = !constantinopleTarget && (strait || !land);
        const seed = nearestSeed(geo.lon, geo.lat, sea);
        const popParts = sea ? [0, 0, 0, 0] : seed[9];
        const population = popParts.reduce((sum, value) => sum + value, 0);
        tiles.push({
          id: id++,
          x,
          y,
          lon: geo.lon,
          lat: geo.lat,
          isSea: sea,
          region: seed[0],
          terrain: terrainFor(geo.lon, geo.lat, seed, sea),
          climate: climateFor(geo.lat, sea),
          good: sea ? "fish" : seed[6],
          culture: sea ? "海域" : seed[7],
          religion: sea ? "无" : seed[8],
          population,
          buildings: sea ? [] : seed[10],
          alignment: sea ? "neutral" : seed[11],
          polity: sea ? "海域" : seed[12],
          city: sea ? "" : data.CITY_BY_REGION[seed[0]] || "",
          control: sea ? 0 : seed[11] === "player" ? 85 : seed[11] === "enemy" ? 58 : 70
        });
      }
    }
    return tiles;
  }

  const tiles = buildTiles();
  const svg = document.getElementById("mapSvg");
  const miniSvg = document.getElementById("miniMapSvg");
  const legend = document.getElementById("mapLegend");
  const terrainBanner = document.getElementById("provinceBanner");

  function node(name, attrs = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    return element;
  }

  function polityColor(polity) {
    if (POLITY_COLORS[polity]) return POLITY_COLORS[polity];
    let hash = 0;
    for (const char of polity) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 35% 48%)`;
  }

  function populationColor(population) {
    const ratio = Math.min(1, population / 18);
    const light = 29 + ratio * 35;
    return `hsl(42 66% ${light}%)`;
  }

  function keyedColor(value, saturation = 42, lightness = 47) {
    let hash = 0;
    for (const char of value || "未知") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} ${saturation}% ${lightness}%)`;
  }

  function tileFill(tile) {
    if (tile.isSea) return TERRAIN.sea[1];
    const world = window.hifiGame?.store?.getState();
    const country = world?.countries?.[tile.polity];
    if (state.mode === "terrain") return TERRAIN[tile.terrain][1];
    if (state.mode === "population") return populationColor(tile.population);
    if (state.mode === "goods") return GOODS[tile.good]?.[1] || "#8f876d";
    if (state.mode === "religion") return keyedColor(tile.religion, 48, 49);
    if (state.mode === "dynasty") return keyedColor(country?.leader?.dynasty, 45, 46);
    if (state.mode === "government") return keyedColor(country?.government?.typeLabel, 38, 48);
    if (state.mode === "estates") {
      const estate = Object.values(country?.estates || {}).sort((a, b) => b.power - a.power)[0];
      return keyedColor(estate?.label || "无主导阶层", 52, 44);
    }
    if (state.mode === "military") {
      const army = Object.values(world?.warfare?.armies || {}).find(item => item.tileId === tile.id);
      if (army) return army.owner === world.playerPolity ? "#4f8f65" : "#a5423d";
      const atWar = world?.diplomacy?.wars?.some(war => war.attackers.includes(tile.polity) || war.defenders.includes(tile.polity));
      return atWar ? "#78513f" : "#77766d";
    }
    if (state.mode === "trade") {
      const routeValue = Object.values(world?.trade?.routes || {}).reduce((sum, route) =>
        route.nodes.includes(tile.city) ? sum + route.flow : sum, 0);
      return routeValue ? `hsl(174 52% ${Math.max(28, 62 - routeValue / 4)}%)` : "#536b68";
    }
    return polityColor(tile.polity);
  }

  function viewBox() {
    const width = VIEW.w / state.zoom;
    const height = VIEW.h / state.zoom;
    const x = Math.max(0, Math.min(VIEW.w - width, state.centerX - width / 2));
    const y = Math.max(0, Math.min(VIEW.h - height, state.centerY - height / 2));
    state.centerX = x + width / 2;
    state.centerY = y + height / 2;
    return { x, y, width, height };
  }

  function applyViewBox() {
    const box = viewBox();
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    document.getElementById("zoomReadout").textContent = `${Math.round(state.zoom * 100)}%`;
    const miniViewport = document.getElementById("miniViewport");
    miniViewport.setAttribute("x", box.x);
    miniViewport.setAttribute("y", box.y);
    miniViewport.setAttribute("width", box.width);
    miniViewport.setAttribute("height", box.height);
  }

  function capitalCities() {
    return new Set(Object.values(data.CAPITAL_BY_POLITY));
  }

  function renderMainMap() {
    svg.replaceChildren();
    svg.appendChild(node("rect", { x: 0, y: 0, width: VIEW.w, height: VIEW.h, class: "map-sea-base" }));
    const tileLayer = node("g", { class: "tile-layer" });
    for (const tile of tiles) {
      const polygon = node("polygon", {
        points: hexPoints(tile.x, tile.y, HEX_R),
        fill: tileFill(tile),
        class: `map-hex ${tile.isSea ? "sea" : ""} ${tile.id === state.selectedId ? "selected" : ""}`,
        "data-map-tile": tile.id
      });
      tileLayer.appendChild(polygon);
    }
    svg.appendChild(tileLayer);

    if (state.mode === "trade" && window.hifiGame?.store?.getState().trade) {
      const routeLayer = node("g", { class: "trade-route-layer" });
      for (const [key, route] of Object.entries(window.hifiGame.store.getState().trade.routes)) {
        const points = route.nodes.map(city => {
          const tile = tiles.find(candidate => candidate.city === city);
          return tile ? `${tile.x},${tile.y}` : null;
        }).filter(Boolean);
        if (points.length < 2 || !route.active) continue;
        routeLayer.appendChild(node("polyline", {
          points: points.join(" "),
          class: "map-trade-route",
          "data-trade-route": key,
          "stroke-width": Math.max(1.5, route.flow / 18),
        }));
      }
      svg.appendChild(routeLayer);
    }

    if (window.hifiGame?.store?.getState().warfare) {
      const armyLayer = node("g", { class: "army-layer" });
      for (const army of Object.values(window.hifiGame.store.getState().warfare.armies)) {
        const tile = tiles.find(candidate => candidate.id === army.tileId);
        if (!tile) continue;
        const marker = node("text", {
          x: tile.x,
          y: tile.y + 5,
          class: "map-army-marker",
          "data-army-marker": army.id,
        });
        marker.textContent = "♞";
        armyLayer.appendChild(marker);
      }
      svg.appendChild(armyLayer);
    }

    const capitals = capitalCities();
    const cityLayer = node("g", { class: "city-layer" });
    data.regionSeeds.forEach((seed, index) => {
      if (seed[3] === "sea") return;
      const city = data.CITY_BY_REGION[seed[0]];
      if (!city || (!capitals.has(city) && index % 6 !== 0)) return;
      const coords = data.CITY_COORDS[city] || [seed[1], seed[2]];
      const point = project(coords[0], coords[1]);
      cityLayer.appendChild(node("circle", { cx: point.x, cy: point.y, r: capitals.has(city) ? 3.2 : 2, class: "map-city-dot" }));
      if (capitals.has(city)) {
        const star = node("text", { x: point.x, y: point.y - 8, class: "map-capital-star" });
        star.textContent = "★";
        cityLayer.appendChild(star);
      }
      const label = node("text", { x: point.x + 5, y: point.y + 4, class: "map-city-label" });
      label.textContent = city;
      cityLayer.appendChild(label);
    });
    svg.appendChild(cityLayer);

    const labelLayer = node("g", { class: "world-label-layer" });
    data.labels.forEach(([label, lon, lat]) => {
      const point = project(lon, lat);
      const text = node("text", { x: point.x, y: point.y, class: label.includes("海") ? "map-world-label sea-label" : "map-world-label" });
      text.textContent = label;
      labelLayer.appendChild(text);
    });
    svg.appendChild(labelLayer);
    applyViewBox();
  }

  function renderMiniMap() {
    miniSvg.replaceChildren();
    miniSvg.appendChild(node("rect", { x: 0, y: 0, width: VIEW.w, height: VIEW.h, class: "mini-sea" }));
    const land = node("g", { class: "mini-land" });
    for (const poly of data.landPolygons) {
      const points = poly.map(([lon, lat]) => {
        const point = project(lon, lat);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
      }).join(" ");
      land.appendChild(node("polygon", { points }));
    }
    miniSvg.appendChild(land);
    miniSvg.appendChild(node("rect", { id: "miniViewport", class: "mini-viewport" }));
    applyViewBox();
  }

  function formatPopulation(tile) {
    if (tile.isSea) return "无常住人口";
    return `${Math.round(tile.population * 31.5)}K`;
  }

  function updateProvince(tile) {
    const terrain = TERRAIN[tile.terrain];
    const good = GOODS[tile.good];
    document.getElementById("provinceName").textContent = tile.city || tile.region;
    document.getElementById("provinceRegion").textContent = tile.isSea ? tile.region : `${tile.polity} · ${tile.region}`;
    document.getElementById("provinceClimate").textContent = CLIMATE[tile.climate];
    document.getElementById("provincePopulation").textContent = formatPopulation(tile);
    document.getElementById("provinceOutput").textContent = good[0];
    const occupied = !tile.isSea && tile.occupier && (tile.occupation || 0) > 0;
    document.getElementById("provinceControl").textContent = tile.isSea ? "—"
      : occupied ? `被占领 ${tile.occupation}%` : `${tile.control}%`;
    document.getElementById("provinceDevelopment").textContent = tile.isSea ? "航道" : String(tile.population * 3 + tile.buildings.length * 8);
    document.getElementById("provinceCulture").textContent = tile.culture;
    document.getElementById("provinceReligion").textContent = tile.religion;
    terrainBanner.style.backgroundImage = `linear-gradient(90deg, rgba(6,14,12,.88), rgba(6,14,12,.1)), url("../../assets/terrain-banners/${tile.terrain}.png")`;
  }

  function selectTile(tile) {
    state.selectedId = tile.id;
    updateProvince(tile);
    renderMainMap();
    window.dispatchEvent(new CustomEvent("hifi:tile-selected", {
      detail: { tileId: tile.id },
    }));
  }

  function nearestTileForRegion(region) {
    return tiles.find(tile => tile.region === region && !tile.isSea)
      || tiles.find(tile => tile.polity === region && !tile.isSea);
  }

  function focusTile(tile) {
    if (!tile) return;
    state.selectedId = tile.id;
    state.zoom = Math.max(state.zoom, 1.65);
    state.centerX = tile.x;
    state.centerY = tile.y;
    updateProvince(tile);
    renderMainMap();
  }

  function syncSelection(tileId) {
    if (state.selectedId === tileId) return;
    const tile = tiles.find(candidate => candidate.id === tileId);
    if (!tile) throw new Error(`地图中不存在地块：${tileId}`);
    state.selectedId = tile.id;
    updateProvince(tile);
  }

  function refreshSelected() {
    const tile = tiles.find(candidate => candidate.id === state.selectedId);
    if (tile) updateProvince(tile);
  }

  function renderLegend() {
    const world = window.hifiGame?.store?.getState();
    const entries = state.mode === "terrain"
      ? Object.entries(TERRAIN).slice(0, 8).map(([, [label, color]]) => [label, color])
      : state.mode === "population"
        ? [["低人口", "hsl(42 66% 29%)"], ["中人口", "hsl(42 66% 47%)"], ["高人口", "hsl(42 66% 64%)"]]
        : state.mode === "goods"
          ? Object.values(GOODS).slice(0, 8).map(([label, color]) => [label, color])
          : state.mode === "religion"
            ? [...new Set(tiles.filter(tile => !tile.isSea).map(tile => tile.religion))].slice(0, 8).map(name => [name, keyedColor(name, 48, 49)])
            : state.mode === "dynasty"
              ? [...new Set(Object.values(world?.countries || {}).map(country => country.leader.dynasty))].slice(0, 8).map(name => [name, keyedColor(name, 45, 46)])
              : state.mode === "government"
                ? [...new Set(Object.values(world?.countries || {}).map(country => country.government.typeLabel))].map(name => [name, keyedColor(name, 38, 48)])
                : state.mode === "estates"
                  ? [...new Set(Object.values(world?.countries || {}).flatMap(country => Object.values(country.estates).map(estate => estate.label)))].slice(0, 8).map(name => [name, keyedColor(name, 52, 44)])
                  : state.mode === "military"
                    ? [["己方军团", "#4f8f65"], ["敌方军团", "#a5423d"], ["交战国", "#78513f"], ["和平地区", "#77766d"]]
                    : state.mode === "trade"
                      ? [["高流量节点", "hsl(174 52% 28%)"], ["低流量节点", "hsl(174 52% 55%)"], ["非贸易节点", "#536b68"]]
                      : ["法兰西王国", "英格兰王国", "神圣罗马帝国", "卡斯蒂利亚王国", "拜占庭帝国"].map(name => [name, polityColor(name)]);
    legend.innerHTML = entries.map(([label, color]) => `<span><i style="background:${color}"></i>${label}</span>`).join("");
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll(".lens").forEach(button => button.classList.toggle("active", button.dataset.mode === mode));
    renderMainMap();
    renderLegend();
  }

  function setZoom(zoom) {
    state.zoom = Math.max(1, Math.min(3.2, zoom));
    applyViewBox();
  }

  function bindControls() {
    svg.addEventListener("click", event => {
      if (state.dragged) return;
      const armyMarker = event.target.closest("[data-army-marker]");
      if (armyMarker) {
        window.dispatchEvent(new CustomEvent("hifi:army-selected", { detail: { armyId: armyMarker.dataset.armyMarker } }));
        return;
      }
      const polygon = event.target.closest("[data-map-tile]");
      if (!polygon) return;
      selectTile(tiles[Number(polygon.dataset.mapTile)]);
    });
    document.querySelectorAll(".lens").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
    document.getElementById("legendToggle").addEventListener("click", () => {
      legend.classList.toggle("open");
      document.getElementById("legendToggle").classList.toggle("active", legend.classList.contains("open"));
    });
    document.getElementById("zoomIn").addEventListener("click", () => setZoom(state.zoom + 0.3));
    document.getElementById("zoomOut").addEventListener("click", () => setZoom(state.zoom - 0.3));
    document.getElementById("zoomReset").addEventListener("click", () => {
      state.zoom = 1;
      state.centerX = VIEW.w / 2;
      state.centerY = VIEW.h / 2;
      applyViewBox();
    });
    miniSvg.addEventListener("click", event => {
      const rect = miniSvg.getBoundingClientRect();
      state.centerX = (event.clientX - rect.left) / rect.width * VIEW.w;
      state.centerY = (event.clientY - rect.top) / rect.height * VIEW.h;
      setZoom(Math.max(1.5, state.zoom));
    });
    svg.addEventListener("wheel", event => {
      event.preventDefault();
      setZoom(state.zoom + (event.deltaY < 0 ? 0.2 : -0.2));
    }, { passive: false });
    svg.addEventListener("pointerdown", event => {
      state.dragStart = { x: event.clientX, y: event.clientY, centerX: state.centerX, centerY: state.centerY };
      state.dragged = false;
    });
    svg.addEventListener("pointermove", event => {
      if (!state.dragStart) return;
      const dx = event.clientX - state.dragStart.x;
      const dy = event.clientY - state.dragStart.y;
      if (Math.hypot(dx, dy) < 5) return;
      state.dragged = true;
      const rect = svg.getBoundingClientRect();
      const box = viewBox();
      state.centerX = state.dragStart.centerX - dx / rect.width * box.width;
      state.centerY = state.dragStart.centerY - dy / rect.height * box.height;
      applyViewBox();
    });
    window.addEventListener("pointerup", () => {
      state.dragStart = null;
      setTimeout(() => { state.dragged = false; }, 0);
    });
  }

  renderMiniMap();
  renderLegend();
  bindControls();
  const paris = nearestTileForRegion("巴黎盆地");
  selectTile(paris);
  window.prototypeMap = { tiles, state, focusTile, renderMainMap, refreshSelected, setMode, setZoom, syncSelection };
})();
