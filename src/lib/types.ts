export type StatKey = "vig" | "mnd" | "end" | "str" | "dex" | "int" | "fai" | "arc";

export type Stats = Record<StatKey, number>;

export interface Link {
  label: string;
  url: string;
}

export interface SourceInfo {
  file: string;
  sha256: string;
  sizeBytes: number;
  sheets: number;
  visibleSheets: number;
  hiddenSheets: number;
}

export interface MetaCounts {
  routeSteps: number;
  routeAreas: number;
  objectives: number;
  microObjectives: number;
  supplementalActions: number;
  items: number;
  itemGroups: Record<string, number>;
  itemRegions: Record<string, number>;
  encounters: number;
  bossStrategyTargets: number;
  npcStates: number;
  dialogueEvents: number;
  worldStates: number;
  traversal: number;
  lockouts: number;
  dependencies: number;
  knowledge: number;
  lore: number;
  decisions: number;
  endings: number;
  certifications: number;
  journeyPlans: number;
  remembrances: number;
  trophyCues: number;
  transitionGates: number;
  merchantCloseout: number;
  farmables: number;
  materials: number;
  finiteResources: number;
  merchants: number;
  scarabs: number;
  tierEntries: number;
  buildArchetypes: number;
  buildProfiles: number;
  buildLoadouts: number;
  techNodes: number;
  techEdges: number;
  progressionLoadouts: number;
  weaponConfigs: number;
  upgradePlans: number;
  encounterPresets: number;
  bossStrategies: number;
  spellPackages: number;
  resourcePresets: number;
  buffs: number;
}

export interface CompletionUnit {
  id: string;
  act: string;
  name: string;
  order: number;
  validation: string;
  description: string;
  objectiveTotal: number;
  sourceRow: number;
}

export interface LegacyRouteArea {
  name: string;
  order: number;
  act: string;
  objectiveIds: string[];
  stepCount: number;
  requiredCount: number;
  hasRoute: boolean;
  description: string;
  validation: string;
}

export interface RouteArea extends LegacyRouteArea {
  game: string;
  phase: string;
  sectionId: string;
  levelRange: string;
  missableCount: number;
  dlc: boolean;
}

export interface RouteStep {
  id: string;
  order: number;
  act: string;
  phase: string;
  area: string;
  sectionId: string;
  sectionTitle: string;
  levelRange: string;
  game: string;
  dlc: boolean;
  objectiveId: string;
  objectiveOrder: number;
  stepOrder: number;
  type: string;
  instruction: string;
  required: boolean;
  linkedRaw: string;
  linkedIds: string[];
  linkedItemNames: string[];
  autoAcquireItemIds: string[];
  autoAcquireBossIds: string[];
  links: Link[];
  badges: string[];
  prerequisites: string;
  warning: string;
  missable: boolean;
  location: string;
  validation: string;
  routeDecision: string;
  skipAllowed: boolean;
  returnWindow: string;
  lockoutRisk: string;
  estimatedTime: string;
  sourceRow: number;
  sourceUrl: string;
  sourceStepId: string;
  objectiveName: string;
}

export interface PhaseGateFilter {
  phase: string;
  sections: string[];
  sectionTitles: string[];
  missableOnly: boolean;
}

export interface PhaseGate {
  id: string;
  order: number;
  phase: string;
  game: string;
  title: string;
  message: string;
  warning: string;
  severity: string;
  area: string;
  beforeSectionId: string;
  filter: PhaseGateFilter;
}

export interface ChronologyPhase {
  id: string;
  label: string;
  sectionCount: number;
  stepCount: number;
}

export interface RouteChronology {
  rule: string;
  phases: ChronologyPhase[];
}

export interface Objective {
  id: string;
  completionUnitId: string;
  order: number;
  name: string;
  location: string;
  requirement: string;
  prerequisiteId: string;
  summary: string;
  validation: string;
  area: string;
  sourceRow: number;
  completionUnit?: string;
}

export interface MicroObjective {
  id: string;
  objectiveId: string;
  order: number;
  name: string;
  location: string;
  type: string;
  required: boolean;
  prerequisiteId: string;
  routeRange: string;
  completionRule: string;
  sourceUrl: string;
  notes: string;
  sourceRow: number;
}

export interface Supplemental {
  kind: string;
  id: string;
  journey: string;
  area: string;
  areaOrder: number;
  category: string;
  action: string;
  trigger: string;
  missable: boolean;
  sourceUrl: string;
  coverageNote: string;
  futureJourney: string;
  notes: string;
  researchStatus: string;
  sourceRow: number;
}

export interface ChronologyArea {
  name: string;
  order: number;
  count: number;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  group: string;
  region: string;
  location: string;
  acquisitionType: string;
  startingOwned: boolean;
  objectiveId: string;
  linkedRouteRaw: string;
  missable: string;
  validation: string;
  sourceUrl: string;
  notes: string;
  game: string;
  sourceRow: number;
  routeStepIds: string[];
  autoStepId: string | null;
  wikiUrl?: string;
  dlc?: boolean;
  section?: string;
  acquisitionText?: string;
  slot?: string;
}

export interface Encounter {
  id: string;
  name: string;
  region: string;
  location: string;
  type: string;
  required: string;
  notes: string;
  validation: string;
  linkedRouteRaw: string;
  sourceRow: number;
  act?: string;
  completionUnit?: string;
  majorBoss?: boolean;
  optional?: boolean;
  respawns?: boolean;
  achievement?: string;
  questRelated?: boolean;
  missable?: boolean;
  multiplayer?: string;
  timeLock?: string;
  tags?: string[];
  notes2?: string;
  recommendedLevel?: string;
  standardWeapon?: string;
  somberWeapon?: string;
  flaskCharges?: string;
  flaskDistribution?: string;
  spiritAsh?: string;
  npcSummon?: string;
  consumables?: string;
  strategyNotes?: string;
  difficulty?: string;
  defaultRoute?: string;
  returnObjective?: string;
  runeRisk?: string;
  scadutree?: string;
  confidence?: string;
  game?: string;
  routeStepIds: string[];
  autoStepId: string | null;
  section?: string;
  levelRange?: string;
  wikiUrl?: string;
  dlc?: boolean;
  badges?: string[];
  links?: Link[];
  sourceId?: string;
  description?: string;
}

export interface AchievementRequirementItem {
  name: string;
  itemId: string;
  wikiUrl: string;
  description: string;
  sourceId: string;
  badges: string[];
  missable: boolean;
  links: Link[];
}

export interface AchievementRequirementGroup {
  id: string;
  name: string;
  kind: string;
  section: string;
  sectionId: string;
  achievementId: string;
  items: AchievementRequirementItem[];
}

export interface Achievement {
  id: string;
  name: string;
  section: string;
  sectionId: string;
  sourceId: string;
  description: string;
  wikiUrl: string;
  badges: string[];
  missable: boolean;
  requirements: string[];
  requirementGroupIds: string[];
  itemIds: string[];
  links: Link[];
}

export interface QuestlineStep {
  id: string;
  sourceId: string;
  questlineId: string;
  npc: string;
  order: number;
  depth: number;
  text: string;
  optional: boolean;
  missable: boolean;
  badges: string[];
  links: Link[];
}

export interface Questline {
  id: string;
  npc: string;
  dlc: boolean;
  game: string;
  sourceUrl: string;
  stepCount: number;
  missableCount: number;
  steps: QuestlineStep[];
}

export interface NgPlusStep {
  id: string;
  sectionId: string;
  sectionTitle: string;
  order: number;
  text: string;
  optional: boolean;
  badges: string[];
  links: Link[];
  dlc: boolean;
}

export interface NgPlusSection {
  id: string;
  title: string;
  order: number;
  levelRange: string;
  game: string;
  stepCount: number;
  steps: NgPlusStep[];
}

export interface ContentCoverageSource {
  sha256: string;
  sections?: number;
  steps?: number;
  items?: number;
  encounters?: number;
  rawRows?: number;
  deduped?: number;
  packItems?: number;
}

export interface ContentCoverage {
  generatedAt: string;
  route: {
    sections: number;
    steps: number;
    baseSteps: number;
    dlcSteps: number;
    preDlcSteps: number;
    endgameSteps: number;
    requiredSteps: number;
    missableSteps: number;
    missableBaseSteps: number;
    missableDlcSteps: number;
    baseSections: number;
    dlcSections: number;
    preDlcSections: number;
    endgameSections: number;
    firstDlcStepOrder: number;
    firstEndgameStepOrder: number;
  };
  items: {
    workbook: number;
    redmawDeduped: number;
    redmawOnly: number;
    matchedWorkbook: number;
    unmatchedWorkbook: number;
    tarnishedPack: number;
    tarnishedPackMerged: number;
    final: number;
    duplicateNameKeys: number;
    linkedToRoute: number;
    placeholdersReplaced: number;
    areaDerivedLocations: number;
    clearedLocations: number;
  };
  achievements: {
    achievements: number;
    requirementGroups: number;
    requirementItems: number;
    linkedRequirementItems: number;
  };
  bosses: {
    workbookEncounters: number;
    redmaw: number;
    matchedWorkbook: number;
    redmawOnly: number;
    final: number;
    linkedToRoute: number;
  };
  questlines: { questlines: number; steps: number };
  ngplus: { sections: number; items: number };
  links: {
    labels: number;
    resolved: number;
    unresolved: number;
    unresolvedUnique: number;
    relativeResolved: number;
  };
  legacyMap: { workbookSteps: number; mapped: number };
  sources: Record<string, ContentCoverageSource>;
}

export interface LinkedRecord {
  id: string;
  sourceRow: number;
  linkedRouteRaw: string;
  routeStepIds: string[];
  autoStepId: string | null;
}

export interface NpcState extends LinkedRecord {
  npc: string;
  region: string;
  milestone: string;
  validation: string;
  warning: string;
}

export interface DialogueEvent extends LinkedRecord {
  npc: string;
  location: string;
  trigger: string;
  warning: string;
  validation: string;
  notes: string;
}

export interface WorldState extends LinkedRecord {
  name: string;
  region: string;
  trigger: string;
  targetState: string;
  validation: string;
  notes: string;
}

export interface Traversal extends LinkedRecord {
  name: string;
  region: string;
  location: string;
  state: string;
  prerequisite: string;
  validation: string;
  notes: string;
}

export interface Lockout extends LinkedRecord {
  act: string;
  area: string;
  trigger: string;
  triggerType: string;
  changes: string;
  severity: string;
  reversible: string;
  safeWindow: string;
  preChecks: string;
  objectiveId: string;
  status: string;
  validation: string;
  notes: string;
}

export interface Dependency extends LinkedRecord {
  act: string;
  area: string;
  event: string;
  dependsOn: string;
  unlocks: string;
  changes: string;
  lockoutRisk: string;
  timing: string;
  objectiveId: string;
  rationale: string;
}

export interface Knowledge {
  id: string;
  sourceRow: number;
  category: string;
  title: string;
  region: string;
  location: string;
  unlockTiming: string;
  objectiveId: string;
  linkedRouteRaw: string;
  spoilerLevel: string;
  validation: string;
  sourceUrl: string;
  guidance: string;
}

export interface LoreEntry {
  id: string;
  journey: string;
  area: string;
  unlockCondition: string;
  areaOrder: number;
  rawSummary: string;
  rawCharacters: string;
  rawEvidence: string;
  rawQuestions: string;
  rawLater: string;
  rawChronicle: string;
  sourceContract: string;
  primaryRouteUrl: string;
  sourceRow: number;
}

export interface Decision {
  id: string;
  game: string;
  category: string;
  title: string;
  decisionPoint: string;
  deadline: string;
  outcomes: string;
  journey1: string;
  journey1Result: string;
  futureOutcome: string;
  futureJourney: string;
  completionRequirement: string;
  sourceRow: number;
}

export interface Ending {
  id: string;
  order: number;
  name: string;
  achievement: string;
  recoveryState: string;
  permanent: string;
  afterCompletion: string;
  sourceRow: number;
}

export interface Certification {
  id: string;
  order: number;
  name: string;
  timing: string;
  purpose: string;
  mandatory: boolean;
  notes: string;
  sourceRow: number;
}

export interface JourneyPlan {
  name: string;
  purpose: string;
  routeScope: string;
  endingTarget: string;
  alternateChoices: string;
  remembrancePlan: string;
  duplicatePlan: string;
  cleanup: string;
  entryRequirements: string;
  status: string;
  notes: string;
  sourceRow: number;
}

export interface SixFuture {
  order: number;
  recoveryState: string;
  ending: string;
  afterCompletion: string;
  permanent: string;
  sourceRow: number;
}

export interface Remembrance {
  id: string;
  name: string;
  boss: string;
  game: string;
  rewards: string[];
  journey1Selection: string;
  journey1Duplication: string;
  journey2Selection: string;
  journey2Duplication: string;
  ngPlusNeed: string;
  duplicateTarget: string;
  consumedForRunes: string;
  location: string;
  duplicationClass: string;
  priority: string;
  sourceUrl: string;
  notes: string;
  sourceRow: number;
}

export interface TrophyCue {
  order: number;
  area: string;
  cue: string;
  flags: string[];
  sourceStepId: string;
  boundary: string;
  sourceRow: number;
}

export interface TransitionGate {
  id: string;
  trigger: string;
  game: string;
  area: string;
  severity: string;
  safeWindow: string;
  preCheck: string;
  sourceStatus: string;
  notes: string;
  sourceRow: number;
}

export interface MerchantCloseout {
  id: string;
  merchant: string;
  scope: string;
  obligation: string;
  deadline: string;
  authority: string;
  coverage: string;
  validation: string;
  notes: string;
  sourceRow: number;
}

export interface CategoryDenominator {
  category: string;
  total: number;
  baseGame: number;
  dlc: number;
  state: string;
  rule: string;
  sourceRow: number;
}

export interface ExternalResource {
  priority: number;
  name: string;
  role: string;
  whenToUse: string;
  coverage: string;
  required: string;
  url: string;
  audit: string;
  notes: string;
  sourceRow: number;
}

export interface Meta {
  source: SourceInfo;
  generatedAt: string;
  counts: MetaCounts;
  coverageNotes: string[];
  completionUnits: CompletionUnit[];
  journeys: JourneyPlan[];
  sixFutures: SixFuture[];
  decisions: Decision[];
  endings: Ending[];
  certifications: Certification[];
  trophyCues: TrophyCue[];
  transitionGates: TransitionGate[];
  merchantCloseout: MerchantCloseout[];
  categoryDenominators: CategoryDenominator[];
  remembrances: Remembrance[];
  externalResources: ExternalResource[];
  routeAreas: LegacyRouteArea[];
  chronologyAreas: ChronologyArea[];
}

export interface Farmable {
  id: string;
  game: string;
  item: string;
  category: string;
  slot: string;
  source: string;
  location: string;
  grace: string;
  dropRate: string;
  dropType: string;
  targetQuantity: number;
  timing: string;
  validation: string;
  sourceUrl: string;
  coverage: string;
  notes: string;
  sourceRow: number;
}

export interface Material {
  id: string;
  game: string;
  name: string;
  category: string;
  renewability: string;
  earlySource: string;
  lateSource: string;
  grace: string;
  method: string;
  purchasable: string;
  merchant: string;
  finiteBeforeUnlock: string;
  priority: string;
  use: string;
  verification: string;
  sourceUrl: string;
  notes: string;
  sourceRow: number;
}

export interface FiniteResource extends LinkedRecord {
  type: string;
  name: string;
  tier: string;
  quantity: number;
  region: string;
  location: string;
  acquisitionType: string;
  objectiveId: string;
  eventuallyPurchasable: string;
  validation: string;
  sourceUrl: string;
  notes: string;
}

export interface MerchantRecord extends LinkedRecord {
  merchant: string;
  item: string;
  category: string;
  cost: string;
  stock: string;
  priority: string;
  objectiveId: string;
  missable: string;
  validation: string;
  sourceUrl: string;
  notes: string;
}

export interface Scarab {
  id: string;
  sourceRow: number;
  game: string;
  region: string;
  section: string;
  sectionOrder: string;
  behavior: string;
  location: string;
  reward: string;
  rewardType: string;
  quantity: string;
  collectionId: string;
  routeRef: string;
  routeStepIds: string[];
  autoStepId: string | null;
}

export interface Archetype {
  id: string;
  name: string;
  priorityStats: string;
  fantasy: string;
  researchStatus: string;
  notes: string;
  sharedClass: string;
  recommendedClass: string;
  classStatus: string;
  familyRole: string;
  parentId: string;
  family: string;
  variant: string;
  disposition: string;
  selectionPolicy: string;
  sourceRow: number;
}

export interface BuildProfile {
  id: string;
  archetypeId: string;
  archetype: string;
  level: number;
  startingClass: string;
  stats: Stats;
  calculatedLevel: number;
  primaryStat: string;
  secondaryStat: string;
  role: string;
  packageId: string;
  regulation: string;
  status: string;
  sourceUrl: string;
  notes: string;
  sourceRow: number;
}

export interface BuildLoadout {
  id: string;
  buildId: string;
  archetype: string;
  level: number;
  type: string;
  mainWeapon: string;
  mainSkill: string;
  secondaryWeapon: string;
  secondarySkill: string;
  offhand: string;
  shield: string;
  armor: string[];
  talismans: string[];
  packageId: string;
  physick: string[];
  sourceRow: number;
}

export interface TechNode {
  id: string;
  name: string;
  type: string;
  stage: string;
  levelMin: number;
  levelTarget: number;
  levelMax: number;
  exactLevel: boolean;
  journeyScope: string;
  regionStage: string;
  originPolicy: string;
  stats: Stats;
  primaryIdentity: string;
  secondaryIdentity: string;
  loadoutId: string;
  requirementSetId: string;
  respecPolicy: string;
  gateNotes: string;
  dlcStatus: string;
  ngPlusStatus: string;
  sourceClass: string;
  destinationIds: string;
  preferredMode: string;
  status: string;
  sourceRow: number;
}

export interface TechEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  levelWindow: string;
  statChange: string;
  equipmentTransition: string;
  weaponTransition: string;
  acquisitionTrigger: string;
  requirementSetId: string;
  respecClass: string;
  larvalTearCost: string;
  destinationsLost: string;
  destinationsGained: string;
  journeyBoundary: string;
  dlcBoundary: string;
  status: string;
  notes: string;
  sourceRow: number;
}

export interface ProgressionLoadout {
  id: string;
  nodeId: string;
  stage: string;
  level: number;
  role: string;
  primaryWeapon: string;
  primaryConfigId: string;
  secondaryWeapon: string;
  secondaryConfigId: string;
  catalyst: string;
  armor: string[];
  talismans: string[];
  spellPackage: string;
  spells: string[];
  physick: string[];
  requiredEquipment: string;
  optionalEquipment: string;
  acquisitionRequirements: string;
  upgradePlanId: string;
  survivalClass: string;
  preferredLanding: string;
  sourceClass: string;
  status: string;
  flask: string;
  notes: string;
  schemaVersion: string;
  loadoutKey: string;
  sourceRow: number;
}

export interface WeaponConfig {
  id: string;
  weapon: string;
  itemClass: string;
  buildContextId: string;
  contextType: string;
  stage: string;
  role: string;
  recommendationClass: string;
  skillType: string;
  skill: string;
  ashTier: string;
  affinity: string;
  alternateAffinity: string;
  buffable: string;
  statFit: string;
  weaponTier: string;
  globalRank: number | null;
  ashRank: number | null;
  sourceRow: number;
}

export interface UpgradePlan {
  id: string;
  nodeId: string;
  configId: string;
  weapon: string;
  track: string;
  ownedState: string;
  combatReady: string;
  currentUpgrade: string;
  minimumUpgrade: string;
  recommendedUpgrade: string;
  stopAt: string;
  stopReason: string;
  nextReview: string;
  replacement: string;
  survivalClass: string;
  capstone: string;
  resource: string;
  archetypeId: string;
  sourceRow: number;
}

export interface EncounterPreset {
  id: string;
  buildId: string;
  archetype: string;
  level: number;
  encounterType: string;
  target: string;
  loadout: string;
  priority: number;
  mainWeapon: string;
  mainSkill: string;
  secondaryWeapon: string;
  secondarySkill: string;
  offhand: string;
  shield: string;
  armor: string;
  talismans: string;
  packageId: string;
  physick: string[];
  greatRune: string;
  flask: string;
  consumables: string;
  sourceRow: number;
}

export interface BossStrategy {
  id: string;
  presetId: string;
  buildId: string;
  level: number;
  routeOrder: number;
  boss: string;
  location: string;
  loadout: string;
  mainWeapon: string;
  skill: string;
  talismans: string;
  packageId: string;
  physick: string;
  flask: string;
  buffs: string;
  opening: string;
  phase1: string;
  phase2: string;
  safeClear: string;
  maxDamage: string;
  tool: string;
  avoid: string;
  sourceRow: number;
}

export interface SpellPackage {
  id: string;
  buildId: string;
  archetype: string;
  level: number;
  name: string;
  role: string;
  modes: string;
  slots: string[];
  totalSlots: number | null;
  primaryTool: string;
  supportTool: string;
  preFight: string;
  hardSwap: string;
  sourceRow: number;
}

export interface ResourcePreset {
  id: string;
  presetId: string;
  buildId: string;
  level: number;
  target: string;
  crimson: number | null;
  cerulean: number | null;
  totalFlasks: number | null;
  maxFp: number | null;
  fpPerFlask: number | null;
  fullBars: number | null;
  fpReserve: number | null;
  aura: string;
  body: string;
  regen: string;
  weaponBuff: string;
  variant: string;
  fieldEffect: string;
  consumables: string;
  useOrder: string;
  conflict: string;
  risk: string;
  sourceRow: number;
}

export interface Buff {
  id: string;
  source: string;
  sourceType: string;
  category: string;
  effect: string;
  duration: string;
  recommendation: string;
  conflicts: string;
  stacksWith: string;
  resourcePolicy: string;
  sourceUrl: string;
  sourceRow: number;
}

export interface TierEntry {
  list: string;
  rank: number;
  tier: string;
  name: string;
  className?: string;
  poolType?: string;
  notes?: string;
  effect?: string;
  duration?: string;
  role?: string;
  ceiling?: string;
  limitation?: string;
}

export interface Warehouse {
  meta: Meta;
  route: {
    areas: RouteArea[];
    objectives: Objective[];
    microObjectives: MicroObjective[];
    steps: RouteStep[];
    supplemental: Supplemental[];
    chronologyAreas: ChronologyArea[];
    phaseGates: PhaseGate[];
  };
  items: Item[];
  world: {
    encounters: Encounter[];
    npcStates: NpcState[];
    dialogueEvents: DialogueEvent[];
    worldStates: WorldState[];
    traversal: Traversal[];
    lockouts: Lockout[];
    dependencies: Dependency[];
    knowledge: Knowledge[];
  };
  builds: {
    archetypes: Archetype[];
    profiles: BuildProfile[];
    loadouts: BuildLoadout[];
    techNodes: TechNode[];
    techEdges: TechEdge[];
    progressionLoadouts: ProgressionLoadout[];
    weaponConfigs: WeaponConfig[];
    upgradePlans: UpgradePlan[];
    encounterPresets: EncounterPreset[];
    bossStrategies: BossStrategy[];
    spellPackages: SpellPackage[];
    resourcePresets: ResourcePreset[];
    buffs: Buff[];
  };
  farms: {
    farmables: Farmable[];
    materials: Material[];
    finiteResources: FiniteResource[];
    merchants: MerchantRecord[];
    scarabs: Scarab[];
  };
  lore: { entries: LoreEntry[] };
  tiers: { entries: TierEntry[] };
}

export type StepStatus = "done" | "skipped" | "deferred";
export type BossStatus = "defeated" | "deferred";

export interface RemembranceState {
  selectedReward?: string;
  duplicated?: boolean;
  consumed?: boolean;
}

export interface EndingState {
  viewed?: boolean;
  earned?: boolean;
  completedAt?: string;
  journeyIndex?: number;
}

export interface JourneyState {
  id: string;
  index: number;
  label: string;
  createdAt: string;
  steps: Record<string, StepStatus>;
  stepNotes: Record<string, string>;
  supplemental: Record<string, StepStatus>;
  npcStates: Record<string, boolean>;
  dialogue: Record<string, boolean>;
  decisions: Record<string, string>;
  bosses: Record<string, BossStatus>;
  farmables: Record<string, number>;
  materials: Record<string, boolean>;
  finite: Record<string, boolean>;
  merchants: Record<string, boolean>;
  scarabs: Record<string, boolean>;
  certifications: Record<string, boolean>;
  transitionGates: Record<string, boolean>;
  remembrances: Record<string, RemembranceState>;
  zonesRevealed: Record<string, boolean>;
  questlineSteps: Record<string, boolean>;
  ngplusChecklist: Record<string, boolean>;
}

export interface EquipmentState {
  mainWeapon: string;
  secondaryWeapon: string;
  offhand: string;
  shield: string;
  armor: string[];
  talismans: string[];
  spells: string[];
  physick: string[];
}

export interface Character {
  id: string;
  name: string;
  createdAt: string;
  classId: string;
  stats: Stats;
  archetypeId: string;
  profileId: string;
  journeyId: string;
  journeys: JourneyState[];
  items: Record<string, boolean>;
  farmables: Record<string, number>;
  loreRead: Record<string, boolean>;
  endings: Record<string, EndingState>;
  achievements: Record<string, boolean>;
  equipment: EquipmentState;
  equipmentMode: "signature" | "optimized" | "fashion" | "custom";
}

export interface Settings {
  spoilerMode: "strict" | "reveal-all";
  density: "comfortable" | "compact";
  reducedMotion: boolean;
  hideCompleted: boolean;
}

export interface AppState {
  schemaVersion: 1;
  characters: Character[];
  activeCharacterId: string;
  settings: Settings;
  updatedAt: string;
}
