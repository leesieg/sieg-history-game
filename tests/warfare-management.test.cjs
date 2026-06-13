const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "prototype", "demos", "帝国的代价-微信小游戏demo.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
assert.ok(script);

const pureScript = script.slice(0, script.indexOf('document.getElementById("endTurnBtn").onclick'));
const context = {
  console,
  Math,
  Map,
  Set,
  document: { createElementNS() { return { setAttribute() {} }; } }
};
vm.createContext(context);
vm.runInContext(
  `${pureScript}
  globalThis.__managementTest = {
    newState,
    armyTotalSoldiers,
    splitArmy,
    mergeArmies,
    reinforceArmy,
    trainArmy,
    demobilizeLevies,
    rulerGeneral,
    assignGeneral,
    dismissGeneral,
    hireMercenary,
    renewMercenaryContract,
    releaseMercenary,
    processMercenaryContracts,
    applyArmyCasualties
  };`,
  context
);

const game = context.__managementTest;
const world = game.newState();
const france = world.countries["法兰西王国"];
const army = Object.values(world.warfare.armies).find(candidate => candidate.owner === "法兰西王国");
const initialSoldiers = game.armyTotalSoldiers(army);

const split = game.splitArmy(world, army.id);
assert.equal(game.armyTotalSoldiers(army) + game.armyTotalSoldiers(split), initialSoldiers);
assert.equal(split.tileId, army.tileId);
assert.equal(split.owner, army.owner);
assert.equal(split.generalId, null);

const merged = game.mergeArmies(world, army.id, split.id);
assert.equal(merged.id, army.id);
assert.equal(game.armyTotalSoldiers(merged), initialSoldiers);
assert.equal(world.warfare.armies[split.id], undefined);

const infantry = merged.units.find(unit => unit.serviceType === "levy" && unit.combatType === "infantry");
infantry.soldiers -= 1000;
const sourceTile = world.tiles[infantry.sourceTileId];
const popBeforeReinforcement = sourceTile.pop[infantry.sourceEstate];
const militaryBeforeReinforcement = france.military;
const reinforced = game.reinforceArmy(world, merged.id);
assert.equal(reinforced, 1000);
assert.equal(sourceTile.pop[infantry.sourceEstate], popBeforeReinforcement - 1);
assert.equal(france.military, militaryBeforeReinforcement - 1);

const experienceBefore = merged.units.map(unit => unit.experience);
const moneyBeforeTraining = france.money;
const supplyBeforeTraining = france.military;
const pointsBeforeTraining = france.actionPoints.military;
game.trainArmy(world, merged.id);
assert.equal(france.money, moneyBeforeTraining - 1);
assert.equal(france.military, supplyBeforeTraining - 1);
assert.equal(france.actionPoints.military, pointsBeforeTraining - 1);
assert.ok(merged.units.every((unit, index) => unit.experience > experienceBefore[index]));

const ruler = game.rulerGeneral(world, "法兰西王国");
assert.equal(ruler.name, france.leader.name);
assert.equal(ruler.isRuler, true);
game.assignGeneral(world, merged.id, ruler.id);
assert.equal(merged.generalId, ruler.id);
game.dismissGeneral(world, merged.id);
assert.equal(merged.generalId, null);

const levySoldiers = merged.units
  .filter(unit => unit.serviceType === "levy")
  .reduce((sum, unit) => sum + unit.soldiers, 0);
const levySource = world.tiles[merged.units.find(unit => unit.serviceType === "levy").sourceTileId];
const levyPopBeforeDemobilization = levySource.pop.peasants;
const returned = game.demobilizeLevies(world, merged.id);
assert.equal(returned, levySoldiers / 1000);
assert.equal(levySource.pop.peasants, levyPopBeforeDemobilization + returned);
assert.ok(merged.units.every(unit => unit.serviceType !== "levy"));

const city = world.tiles[merged.tileId];
assert.ok(city.city);
france.money = 20;
const mercenary = game.hireMercenary(world, "法兰西王国", city.id);
assert.equal(mercenary.mercenaryWage, 2);
assert.ok(mercenary.contractEndsTurn > world.turn);
assert.throws(
  () => game.mergeArmies(world, merged.id, mercenary.id),
  /佣兵团与本国军团不能直接合并/
);
assert.throws(
  () => game.assignGeneral(world, mercenary.id, ruler.id),
  /佣兵团使用自带首领/
);
const mercenaryWageBeforeSplit = mercenary.mercenaryWage;
const mercenarySplit = game.splitArmy(world, mercenary.id);
assert.equal(mercenary.mercenaryWage + mercenarySplit.mercenaryWage, mercenaryWageBeforeSplit);
game.mergeArmies(world, mercenary.id, mercenarySplit.id);

const firstContractEnd = mercenary.contractEndsTurn;
game.renewMercenaryContract(world, mercenary.id);
assert.ok(mercenary.contractEndsTurn > firstContractEnd);

const loyaltyBeforeCasualties = mercenary.mercenaryLoyalty;
game.applyArmyCasualties(world, [mercenary], 900);
assert.ok(mercenary.mercenaryLoyalty < loyaltyBeforeCasualties);

france.money = 0;
const loyaltyBeforeArrears = mercenary.mercenaryLoyalty;
game.processMercenaryContracts(world, "法兰西王国");
assert.ok(mercenary.mercenaryLoyalty < loyaltyBeforeArrears);

game.releaseMercenary(world, mercenary.id);
assert.equal(world.warfare.armies[mercenary.id], undefined);

france.money = 20;
const expiringMercenary = game.hireMercenary(world, "法兰西王国", city.id);
expiringMercenary.contractEndsTurn = world.turn;
game.processMercenaryContracts(world, "法兰西王国");
assert.equal(world.warfare.armies[expiringMercenary.id], undefined);

console.log("warfare management tests passed");
