/* Minimal test harness shared by the Node test files (no dependencies). */
const results = { pass: 0, fail: 0, failures: [] };
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
async function run(title) {
  console.log('\n# ' + title);
  for (const [name, fn] of queue) {
    try { await fn(); results.pass++; console.log('  ok  ' + name); }
    catch (e) { results.fail++; results.failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); }
  }
  console.log(`\n${results.pass} passed, ${results.fail} failed, ${results.pass + results.fail} total`);
  if (results.fail) process.exitCode = 1;
}
module.exports = { test, run, results };
