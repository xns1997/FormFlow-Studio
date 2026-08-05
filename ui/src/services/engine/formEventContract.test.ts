import assert from 'node:assert/strict';
import test from 'node:test';
import { FORM_EVENT_CONTRACT, FORM_EVENT_SCRIPT_ALIAS_KEYS, renderFormEventContractInterface } from '../../../../shared/formflow-core/formEventContract';
import { createEventContextExtraLib, createEventContextSuggestions, createChainApiExtraLib } from '../../components/codeEditorSuggestions';
import { controlApis, controlOnlyContextFields } from '../io/docs/shared';
import { SCRIPT_ALIAS_KEYS } from '../config/scriptRuntime';

test('runtime aliases, editor and docs are generated from the public form event contract', () => {
  const suggestions = new Set(createEventContextSuggestions().map((item) => item.label));
  const documented = new Set([
    ...controlOnlyContextFields.map((item) => item.name),
    ...controlApis.map((item) => item.name),
  ]);
  const declaration = `${createEventContextExtraLib({ filePath: 'inmemory://event-contract.d.ts' }).content}\n${createChainApiExtraLib().content}`;
  assert.ok(declaration.includes(renderFormEventContractInterface()), 'editor must embed the canonical generated interface verbatim');
  const specializedContext = declaration.slice(
    declaration.indexOf('interface FormEventContext extends FormEventCanonicalContract {'),
    declaration.indexOf('type FormEventHandler'),
  );

  for (const member of FORM_EVENT_CONTRACT) {
    assert.ok(suggestions.has(`ctx.${member.name}`), `editor missing ctx.${member.name}`);
    assert.ok(documented.has(`ctx.${member.name}`), `docs missing ctx.${member.name}`);
    assert.ok(renderFormEventContractInterface().includes(`/** ${member.description} */`), `jsdoc missing ${member.name}`);
    const exactDeclaration = member.kind === 'method'
      ? `  ${member.signature};`
      : `  ${member.name}: ${member.type};`;
    assert.ok(declaration.includes(exactDeclaration), `type declaration missing exact contract: ${exactDeclaration}`);
    assert.equal(specializedContext.includes(exactDeclaration), false, `canonical declaration duplicated in specialized context: ${member.name}`);
    if (member.topLevelAlias) {
      assert.ok(FORM_EVENT_SCRIPT_ALIAS_KEYS.includes(member.name), `contract alias missing ${member.name}`);
      assert.ok(SCRIPT_ALIAS_KEYS.includes(member.name), `runtime alias missing ${member.name}`);
      const exactAlias = member.kind === 'method'
        ? `declare function ${member.signature};`
        : `declare const ${member.name}: ${member.type};`;
      assert.equal(declaration.split(exactAlias).length - 1, 1, `canonical alias duplicated: ${member.name}`);
    }
  }
});
