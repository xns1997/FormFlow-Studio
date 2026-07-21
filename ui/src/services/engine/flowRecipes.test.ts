import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlowRecipe, FLOW_RECIPES, validateFlowRecipeParams } from './flowRecipes';

test('all recipes create parameterized workflows with explicit import and export nodes', () => {
  for (const recipe of FLOW_RECIPES) {
    const workflow = createFlowRecipe(recipe.id, { tableId: 'customers', sheetName: '客户', keyField: '客户编号' });
    assert.equal(workflow.nodes[0]?.specId, 'workflow:import');
    assert.equal(workflow.nodes.at(-1)?.specId, 'workflow:export');
    assert.ok(workflow.nodes.length >= 3);
    assert.ok(workflow.edges.length >= 2);
  }
});

test('recipe validation names missing business parameters before graph creation', () => {
  assert.deepEqual(validateFlowRecipeParams('validate-save', { tableId: 't' }), ['sheetName', 'keyField']);
  assert.throws(() => createFlowRecipe('lookup-fill', {}), /tableId、sheetName/);
});
