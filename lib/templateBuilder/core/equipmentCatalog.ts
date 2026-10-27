// equipmentCatalog — what each piece of equipment physically contains (owner rulings 2026-10-26).
//
// DECISIONS 2026-10-26 (second) #2 and (third): Ledrix ships a catalog of each equipment type's KNOWN
// components; in the Template Builder the company PICKS from it instead of typing, and turns Condition /
// Details / Evidence on or off for each component it keeps. What a gas furnace contains is Ledrix's
// structure, not a standards body's content and not the company's content — so this lives in core, and
// the company's template only ever holds the components the company chose.
//
//   · Everything starts UNTICKED. Nothing here is in any template until a company picks it.
//   · `presence`: 'typical' = generally part of this equipment; 'if_present' = depends on the installation
//     (with the reason in `note`). Neither means "required".
//   · Supply vs component (2026-10-26): fuel-burning types carry combustion and fuel-supply groups; nothing
//     else does. Electrical & controls are offered for every fuel.
//   · `kind`: 'part' is a physical component (ticked → Condition on); 'reading' and 'plate' are evidence
//     (ticked → Evidence only). A reading names a measurement point where the app already has one.
//
// PURE and import-free: byte-copied to the website (scripts/web-preview-sync.json) and read by the phone.

export type CatalogPresence = 'typical' | 'if_present';
export type CatalogKind = 'part' | 'reading' | 'plate';

export type CatalogComponent = {
  /** Stable within its equipment type; the template records `<typeId>.<id>` as provenance. */
  id: string;
  label: string;
  presence: CatalogPresence;
  /** Why it depends on the installation ('if_present' only). */
  note?: string;
  kind: CatalogKind;
  /** Choices for the Details switch. Absent = Details does not apply to this component. */
  details?: string[];
  /** 'reading' only: what is measured, its units (first = default) and the app's measurement point, if any. */
  reading?: { name: string; units: string[]; point?: { system: string; id: string } };
  /** Default report caption for evidence ('reading' and 'plate'). */
  caption?: string;
};

export type CatalogGroup = { id: string; label: string; why: string; components: CatalogComponent[] };

export type CatalogEquipmentType = {
  id: string;
  label: string;
  /** The template system it is offered under. */
  system: string;
  intro: string;
  /** When this equipment's components apply: an answer on the system's equipment field (a company rule in the
   *  template grammar). Added to each picked component only when the template has that field and those values. */
  equipmentRule?: { field: string; anyOf: string[] };
  groups: CatalogGroup[];
};

export const EQUIPMENT_CATALOG_VERSION = 1;

/** What the inspector sees as the Details field's name. Default 'Type'. */
const DETAILS_LABEL: Record<string, string> = {
  vent: 'Material', plenum: 'Material', condensate: 'Material', connector: 'Connector type', tank: 'Tank type',
  oilline: 'Line material', relief: 'Discharge pipe material', piping: 'Pipe material', rads: 'Emitter type',
  lines: 'Line material', pad: 'Mounting', head: 'Head count', hfilter: 'Filter type', hdrain: 'Drain routing', filter: 'Filter type',
};
export const detailsLabelOf = (c: CatalogComponent): string => DETAILS_LABEL[c.id] ?? 'Type';

/** Names an existing template already uses for the same part (so a pick is recognised, not duplicated). */
const ALSO_KNOWN_AS: Record<string, string[]> = {
  vent: ['Furnace Flue / Venting', 'Flue / Venting', 'Flue'], hx: ['Heat Exchanger'], burner: ['Burner / Flame', 'Burner'],
  combair: ['Combustion Air'], cabinet: ['Cabinet / Access'], plate: ['Data Plate (Make/Model)', 'Data Plate'],
  filter: ['Filter'], thermostat: ['Thermostat'], disconnect: ['Service Disconnect'], cdrain: ['Condensate Line'],
  compressor: ['Compressor'], evapcoil: ['Evaporator Coil'],
};
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Does an existing item's label name this catalog component? */
export function catalogLabelMatches(c: CatalogComponent, label: string): boolean {
  const n = norm(label);
  return !!n && (n === norm(c.label) || (ALSO_KNOWN_AS[c.id] ?? []).some(a => norm(a) === n));
}

const HEAT_FUEL = 'hvac_heating::fuel_source';

const T = (id: string, label: string, details?: string[]): CatalogComponent => ({ id, label, presence: 'typical', kind: 'part', ...(details ? { details } : {}) });
const D = (id: string, label: string, note: string, details?: string[]): CatalogComponent => ({ id, label, presence: 'if_present', note, kind: 'part', ...(details ? { details } : {}) });
const R = (id: string, label: string, units: string[], caption: string, point?: { system: string; id: string }, note?: string): CatalogComponent =>
  ({ id, label, presence: note ? 'if_present' : 'typical', ...(note ? { note } : {}), kind: 'reading', reading: { name: label, units, ...(point ? { point } : {}) }, caption });
const P = (id: string, label: string, caption: string): CatalogComponent => ({ id, label, presence: 'typical', kind: 'plate', caption });

const F = ['°F', '°C'];
const GAS_VENT = ['Metal B-vent', 'PVC (high-efficiency)', 'Single-wall metal', 'Masonry chimney liner'];
const OIL_VENT = ['Single-wall metal', 'Masonry chimney', 'Stainless chimney liner'];
const FILTER = ['1" disposable', '4–5" media', 'Washable / electronic'];
const READ_GROUP = { id: 'readings', label: 'Readings & records', why: 'evidence — documents, never grades' };

const airHandling = (why: string): CatalogGroup => ({ id: 'air', label: 'Air handling', why, components: [
  T('blower', 'Blower motor & wheel'), T('filter', 'Filter', FILTER), T('cabinet', 'Cabinet & access panels'),
  T('plenum', 'Supply & return plenums', ['Sheet metal', 'Duct board', 'Flex duct']),
  D('coil', 'Cooling coil (A-coil)', 'when central AC shares this unit'),
  D('pan', 'Secondary drain pan', 'attic or over-living-space installs'),
] });
const accessories: CatalogGroup = { id: 'accessories', label: 'Accessories', why: 'only if installed', components: [
  D('humidifier', 'Humidifier', 'if installed'), D('aircleaner', 'Air cleaner / UV light', 'if installed'),
  D('condpump', 'Condensate pump', "when the drain can't flow by gravity"),
] };
const gasSupply: CatalogGroup = { id: 'gas', label: 'Gas supply', why: 'because the fuel is gas', components: [
  T('gasvalve', 'Gas shutoff valve'), T('sediment', 'Sediment trap (drip leg)'),
  T('connector', 'Appliance gas connector', ['Corrugated stainless (CSST)', 'Coated flexible connector', 'Black iron pipe']),
] };
const oilBurner: CatalogGroup = { id: 'oilburner', label: 'Oil burner & venting', why: 'because it burns oil', components: [
  T('oilburner', 'Burner assembly (nozzle & electrodes)'), T('burnermotor', 'Burner motor & fan'),
  T('igniter', 'Ignition transformer / igniter'), T('primary', 'Primary control (cad cell / stack relay)'),
  T('hx', 'Combustion chamber / heat exchanger (visible portions)'), T('baro', 'Barometric draft damper'),
  T('vent', 'Vent connector / flue', OIL_VENT), T('combair', 'Combustion air supply'),
] };
const oilSupply: CatalogGroup = { id: 'oil', label: 'Oil supply', why: 'because the fuel is oil', components: [
  T('tank', 'Oil storage tank', ['Indoor steel tank', 'Outdoor above-ground tank', 'Underground tank']),
  T('tankpipes', 'Tank fill & vent pipes'), T('oilfilter', 'Oil filter'),
  T('oilline', 'Oil supply line', ['Coated copper', 'Uncoated copper', 'Steel']),
  T('oilvalve', 'Shutoff / fire-safety valve'),
  D('osv', 'Oil safety valve (OSV)', 'when the line runs uphill or local code requires it'),
] };
const waterSide = (extra: CatalogComponent[] = []): CatalogGroup => ({ id: 'water', label: 'Water side', why: 'hydronic', components: [
  T('relief', 'Pressure relief valve & discharge pipe', ['Copper', 'CPVC', 'Galvanized']), T('exptank', 'Expansion tank'),
  T('circ', 'Circulator pump(s)'), T('gauge', 'Pressure / temperature gauge'), T('fill', 'Fill valve & backflow preventer'),
  T('piping', 'Supply & return piping', ['Copper', 'PEX', 'Black iron']),
  D('zones', 'Zone valves', 'multi-zone systems'), ...extra,
] });
const distribution: CatalogGroup = { id: 'distribution', label: 'Distribution', why: 'where the heat goes', components: [
  T('rads', 'Radiators / baseboard convectors', ['Cast-iron radiators', 'Fin-tube baseboard', 'Panel radiators']),
  D('radiant', 'Radiant floor manifold', 'radiant floor systems'),
] };
const furnaceReadings = (extra: CatalogComponent[]): CatalogGroup => ({ ...READ_GROUP, components: [
  R('supplytemp', 'Supply register temperature', F, 'Furnace Temperature at Register', { system: 'heating', id: 'supply_register' }),
  R('returntemp', 'Return air temperature', F, 'Return Air Temperature', { system: 'heating', id: 'return_air' }),
  R('temprise', 'Temperature rise', F, 'Temperature Rise', { system: 'heating', id: 'temp_rise' }),
  ...extra,
  P('plate', 'Data plate', 'Furnace Data Plate'),
] });
const boilerReadings = (extra: CatalogComponent[] = []): CatalogGroup => ({ ...READ_GROUP, components: [
  R('pressure', 'Boiler operating pressure', ['psi'], 'Boiler Operating Pressure'),
  R('watertemp', 'Supply water temperature', F, 'Boiler Supply Water Temperature'),
  ...extra,
  P('plate', 'Data plate', 'Boiler Data Plate'),
] });
const LWCO = D('lwco', 'Low-water cutoff', 'steam boilers and some hot-water installs');

export const EQUIPMENT_CATALOG: CatalogEquipmentType[] = [
  { id: 'gas_furnace', label: 'Gas furnace', system: 'heating', intro: 'Components Ledrix knows for a gas furnace.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Gas Furnace', 'Propane'] }, groups: [
    { id: 'combustion', label: 'Combustion & venting', why: 'because it burns gas', components: [
      T('burner', 'Burner / flame'), T('hx', 'Heat exchanger (visible portions)'), T('ignition', 'Ignition — hot-surface igniter or pilot'),
      T('flamesafety', 'Flame sensor & rollout switch'), D('inducer', 'Draft inducer motor', 'induced-draft & high-efficiency units'),
      T('vent', 'Vent connector / flue', GAS_VENT), T('combair', 'Combustion air supply'),
      D('condensate', 'Condensate drain & trap', 'high-efficiency (condensing) units', ['PVC', 'Vinyl tubing']),
    ] },
    gasSupply,
    airHandling('every forced-air furnace'),
    { id: 'electrical', label: 'Electrical & controls', why: 'every fuel — gas does not remove these', components: [
      T('disconnect', 'Service switch / disconnect'), T('board', 'Control board & limit switches'), T('thermostat', 'Thermostat'), T('wiring', 'Wiring connections'),
    ] },
    accessories,
    furnaceReadings([R('co', 'Carbon monoxide at flue', ['ppm'], 'Flue CO Reading', undefined, 'if your company tests CO')]),
  ] },
  { id: 'oil_furnace', label: 'Oil furnace', system: 'heating', intro: 'Components Ledrix knows for an oil-fired furnace — an oil burner and an oil supply instead of gas.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Oil Furnace'] }, groups: [
    oilBurner, oilSupply,
    airHandling('every forced-air furnace — oil furnaces have a filter too'),
    { id: 'electrical', label: 'Electrical & controls', why: 'every fuel — oil does not remove these', components: [
      T('disconnect', 'Emergency service switch'), T('board', 'Control board & limit switches'), T('thermostat', 'Thermostat'), T('wiring', 'Wiring connections'),
    ] },
    accessories,
    furnaceReadings([
      R('stacktemp', 'Stack (flue gas) temperature', F, 'Flue Gas Temperature', undefined, 'if your company tests combustion'),
      R('draft', 'Over-fire / breech draft', ['in. w.c.'], 'Draft Reading', undefined, 'if your company tests combustion'),
    ]),
  ] },
  { id: 'electric_furnace', label: 'Electric furnace', system: 'heating', intro: 'Components Ledrix knows for an electric furnace — no combustion, no fuel supply.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Electric Heat'] }, groups: [
    { id: 'elements', label: 'Heating elements', why: 'electric resistance heat', components: [
      T('elements', 'Heating elements'), T('sequencers', 'Sequencers / relays'), T('elimits', 'High-limit switches'),
    ] },
    airHandling('every forced-air furnace'),
    { id: 'electrical', label: 'Electrical & controls', why: 'the heat source is electric', components: [
      T('circuit', 'Dedicated circuit & breaker size'), T('disconnect', 'Service disconnect'), T('board', 'Control board'),
      T('thermostat', 'Thermostat'), T('wiring', 'Wiring connections'),
    ] },
    accessories,
    furnaceReadings([R('amps', 'Element current draw', ['A'], 'Element Current Draw', undefined, 'if your company measures it')]),
  ] },
  { id: 'heat_pump', label: 'Heat pump', system: 'heating', intro: 'Components Ledrix knows for a split heat pump — outdoor unit plus indoor air handler.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Heat Pump'] }, groups: [
    { id: 'outdoor', label: 'Outdoor unit', why: 'every split heat pump', components: [
      T('compressor', 'Compressor & outdoor coil'), T('ofan', 'Outdoor fan'),
      T('lines', 'Refrigerant lines & insulation', ['Copper with foam insulation', 'Aluminum']),
      T('pad', 'Pad / mounting & clearances', ['Concrete pad', 'Composite pad', 'Wall bracket']), T('defrost', 'Defrost operation'),
    ] },
    { id: 'indoor', label: 'Indoor air handler', why: 'forced air', components: [
      T('blower', 'Blower motor & wheel'), T('evapcoil', 'Indoor coil'), T('filter', 'Filter', FILTER), T('cabinet', 'Cabinet & access panels'),
      T('cdrain', 'Condensate drain & trap', ['PVC', 'Vinyl tubing']),
      D('auxheat', 'Auxiliary / emergency heat strips', 'most cold-climate installs'),
      D('pan', 'Secondary drain pan', 'attic or over-living-space installs'), D('condpump', 'Condensate pump', "when the drain can't flow by gravity"),
    ] },
    { id: 'electrical', label: 'Electrical & controls', why: 'every heat pump', components: [
      T('odisc', 'Outdoor disconnect'), T('idisc', 'Indoor disconnect'), T('thermostat', 'Thermostat (heat-pump capable)'), T('wiring', 'Wiring connections'),
    ] },
    { ...READ_GROUP, components: [
      R('supplytemp', 'Supply register temperature', F, 'Heat Pump Supply Temperature', { system: 'heating', id: 'supply_register' }),
      R('returntemp', 'Return air temperature', F, 'Return Air Temperature', { system: 'heating', id: 'return_air' }),
      R('split', 'Temperature split', F, 'Temperature Split', { system: 'cooling', id: 'temp_split' }),
      P('plateout', 'Outdoor unit data plate', 'Outdoor Unit Data Plate'), P('platein', 'Air handler data plate', 'Air Handler Data Plate'),
    ] },
  ] },
  { id: 'gas_boiler', label: 'Gas boiler', system: 'heating', intro: 'Components Ledrix knows for a gas-fired hot-water boiler — no blower, no air filter.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Boiler'] }, groups: [
    { id: 'combustion', label: 'Combustion & venting', why: 'because it burns gas', components: [
      T('burner', 'Burner / flame'), T('hx', 'Heat exchanger (visible portions)'), T('ignition', 'Ignition — igniter or pilot'),
      T('vent', 'Vent connector / flue', GAS_VENT), T('combair', 'Combustion air supply'),
      D('condensate', 'Condensate drain & neutralizer', 'condensing boilers', ['PVC', 'Vinyl tubing']),
    ] },
    gasSupply, waterSide([LWCO]), distribution,
    { id: 'electrical', label: 'Electrical & controls', why: 'every fuel', components: [
      T('disconnect', 'Emergency service switch'), T('aquastat', 'Boiler control / aquastat'), T('thermostat', 'Thermostat(s)'),
    ] },
    boilerReadings(),
  ] },
  { id: 'oil_boiler', label: 'Oil boiler', system: 'heating', intro: 'Components Ledrix knows for an oil-fired hot-water boiler — oil burner and oil supply, no blower, no air filter.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Boiler'] }, groups: [
    oilBurner, oilSupply,
    waterSide([LWCO, D('tankless', 'Tankless domestic hot-water coil', 'when the boiler also heats household water')]),
    distribution,
    { id: 'electrical', label: 'Electrical & controls', why: 'every fuel', components: [
      T('disconnect', 'Emergency service switch'), T('aquastat', 'Boiler control / aquastat'), T('thermostat', 'Thermostat(s)'),
    ] },
    boilerReadings([R('stacktemp', 'Stack (flue gas) temperature', F, 'Flue Gas Temperature', undefined, 'if your company tests combustion')]),
  ] },
  { id: 'electric_boiler', label: 'Electric boiler', system: 'heating', intro: 'Components Ledrix knows for an electric hot-water boiler — no combustion, no fuel supply, no venting.', equipmentRule: { field: HEAT_FUEL, anyOf: ['Boiler'] }, groups: [
    { id: 'elements', label: 'Heating elements', why: 'electric resistance heat', components: [
      T('elements', 'Heating elements'), T('contactors', 'Contactors / relays'), T('hilimit', 'High-temperature limit control'),
    ] },
    waterSide(), distribution,
    { id: 'electrical', label: 'Electrical & controls', why: 'the heat source is electric', components: [
      T('circuit', 'Dedicated circuit & breaker size'), T('disconnect', 'Service disconnect'),
      T('aquastat', 'Boiler control'), T('thermostat', 'Thermostat(s)'), T('wiring', 'Wiring connections'),
    ] },
    boilerReadings([R('amps', 'Element current draw', ['A'], 'Element Current Draw', undefined, 'if your company measures it')]),
  ] },
  { id: 'mini_split', label: 'Ductless mini-split', system: 'heating', intro: 'Components Ledrix knows for a ductless mini-split — no ducts, no central filter, no combustion.', equipmentRule: { field: 'hvac_distribution::spec', anyOf: ['Ductless'] }, groups: [
    { id: 'outdoor', label: 'Outdoor unit', why: 'every mini-split', components: [
      T('compressor', 'Compressor & outdoor coil'), T('ofan', 'Outdoor fan'),
      T('lines', 'Refrigerant lines & insulation', ['Copper with foam insulation', 'Aluminum']),
      T('pad', 'Pad / mounting & clearances', ['Ground pad', 'Wall bracket', 'Roof stand']),
      D('linecover', 'Line-set cover', 'if installed'), D('odrain', 'Outdoor defrost drain', 'heat-pump models in freezing climates'),
    ] },
    { id: 'heads', label: 'Indoor heads', why: 'assessed together — a finding names the room', components: [
      T('head', 'Indoor heads (head count)', ['1 head', '2 heads', '3 heads', '4 heads', '5 or more heads']),
      T('hfilter', 'Head filters', ['Washable mesh', 'Mesh + carbon / ion insert']), T('hcoil', 'Head coil & blower wheel'),
      T('hdrain', 'Head condensate line', ['Gravity line', 'Routed in line-set cover']),
      D('hpump', 'Head condensate pump', "when the head can't drain by gravity"), T('controller', 'Remote / wall controller'),
    ] },
    { id: 'electrical', label: 'Electrical', why: 'every mini-split', components: [
      T('odisc', 'Outdoor disconnect'), T('interconnect', 'Interconnect wiring'),
    ] },
    { ...READ_GROUP, components: [
      R('discharge', 'Head discharge air temperature', F, 'Mini-Split Discharge Air Temperature', { system: 'cooling', id: 'discharge' }),
      R('split', 'Temperature split', F, 'Temperature Split', { system: 'cooling', id: 'temp_split' }),
      P('plateout', 'Outdoor unit data plate', 'Outdoor Unit Data Plate'),
    ] },
  ] },
];

/** The equipment types offered under one template system. */
export function catalogTypesFor(systemId: string): CatalogEquipmentType[] {
  return EQUIPMENT_CATALOG.filter(t => t.system === systemId);
}

export function catalogType(typeId: string): CatalogEquipmentType | undefined {
  return EQUIPMENT_CATALOG.find(t => t.id === typeId);
}

/** Provenance key a template node records: `<typeId>.<componentId>`. */
export const catalogRefOf = (typeId: string, componentId: string): string => `${typeId}.${componentId}`;

export function catalogComponent(ref: string): { type: CatalogEquipmentType; component: CatalogComponent } | null {
  const dot = ref.indexOf('.');
  if (dot < 1) return null;
  const type = catalogType(ref.slice(0, dot));
  const id = ref.slice(dot + 1);
  for (const g of type?.groups ?? []) for (const c of g.components) if (c.id === id) return { type: type!, component: c };
  return null;
}
