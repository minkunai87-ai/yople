const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function readFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} must exist`);
  const brace = html.indexOf('{', html.indexOf(')', start));
  let depth = 0, quote = '', escaped = false;
  for(let index = brace; index < html.length; index++) {
    const char = html[index];
    if(quote) {
      if(escaped) escaped = false;
      else if(char === '\\') escaped = true;
      else if(char === quote) quote = '';
      continue;
    }
    if(char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if(char === '{') depth++;
    if(char === '}' && --depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const now = new Date(2026, 7, 11, 12).getTime();
const today = new Date(2026, 7, 11).getTime();
const old = new Date(2026, 7, 10, 12).getTime();
const future = new Date(2026, 7, 12).getTime();
const stats = {
  A:{dueDate:today,history:[{time:old}]},
  B:{dueDate:future,history:[{time:old},{time:now,wasTodayReview:true},{time:now+1,wasTodayReview:true}]},
  C:{dueDate:future,history:[{time:now,wasTodayReview:false},{time:now+1,wasTodayReview:false}]},
  D:{dueDate:future,history:[{time:old},{time:now}]}
};
const context = {
  console, Date, Set, Map, Object, String, Array,
  library:{'행정법__총론':[{id:'A',deck:'행정법__총론'},{id:'B',deck:'행정법__총론'}],'행정법__각론':[{id:'A',deck:'행정법__각론'},{id:'C',deck:'행정법__각론'}],'민법__총칙':[{id:'D',deck:'민법__총칙'}]},
  getStatsStore:() => stats,
  findStatsForCard:card => stats[card.id] || {}
};
vm.createContext(context);
vm.runInContext('function getHistoryItemTime(item) { return Number(item && item.time) || 0; }', context);
['getTodayEssentialCardId','getLocalTodayBounds','isHistoryItemToday','isTodayReviewTarget','getUniqueLibraryCards','buildLearningStatsModel'].forEach(name => vm.runInContext(readFunction(name), context));

const model = context.buildLearningStatsModel(now);
assert.strictEqual(context.getUniqueLibraryCards().length, 4, 'cards are unique by UUID');
assert.deepStrictEqual([...model.totals.todayReview].sort(), ['A','B','D'], 'remaining and completed review targets are included');
assert.deepStrictEqual([...model.totals.todayReviewDone].sort(), ['B','D'], 'review numerator is target intersection today study');
assert.deepStrictEqual([...model.totals.otherStudy], ['C'], 'non-review study is other');
assert.deepStrictEqual([...model.totals.totalStudy].sort(), ['B','C','D'], 'multiple events count once per UUID');
assert.deepStrictEqual([...model.decks.get('행정법').todayReview].sort(), ['A','B'], 'top deck includes descendants');
assert.deepStrictEqual([...model.decks.get('행정법').todayReviewDone], ['B'], 'top deck numerator includes completed descendant targets');
assert(readFunction('applyFilterAndSort').includes('isTodayReviewTarget(s)'), 'filter reuses common predicate');
assert(readFunction('buildTodayEssentialCandidates').includes('isTodayReviewTarget(stat, todayStart)'), 'essential selector reuses common predicate');
assert(!readFunction('buildLearningStatsModel').includes('setStorageItem'), 'statistics calculation is read-only');
assert(!html.includes('오늘 새로</span>'), 'statistics has no today-new metric');
console.log('Yople learning stats scenarios passed');
