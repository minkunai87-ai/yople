const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('today essential keeps the canonical Stats store and never writes Firebase', async ({ page }) => {
  const firebaseNetworkWrites = [];
  const consoleErrors = [];
  page.on('request', request => {
    if (request.url().includes('yokiapp-afcca-default-rtdb.firebaseio.com')
        && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      firebaseNetworkWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('http://127.0.0.1:4173/?yopleTestMode=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof openTodayEssentialSheet === 'function');
  await page.waitForFunction(() => typeof isBooting !== 'undefined' && !isBooting && Object.keys(library || {}).length > 0);

  const setup = await page.evaluate(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cards = Array.from({ length: 2000 }, (_, index) => ({
      id: `safe-card-${index}`,
      q: `Question ${index}`,
      a: `Answer ${index}`
    }));
    const stats = {};
    for (let index = 0; index < 11365; index += 1) {
      stats[`safe-card-${index}`] = {
        correct: index % 3,
        total: 4,
        lastDate: today.getTime() - ((index % 30) + 1) * 86400000,
        dueDate: index < 600 ? today.getTime() - (index % 20) * 86400000 : today.getTime() + 86400000,
        history: index < 600 ? [{ score: index % 4 === 0 ? 0 : 2, time: today.getTime() - 86400000 }] : [],
        fsrs: { D: 5, S: 3, reps: 4 }
      };
    }
    library = { Synthetic: cards };
    currentDeckName = 'Synthetic';
    originalDeck = cards;
    activeDeck = cards.slice();
    currentIndex = 0;
    currentFilterMode = 'default';
    currentSortMode = 'original';
    currentSecondarySortMode = 'none';
    inMemoryStatsStore = stats;
    localStorage.setItem(REVIEW_DURATION_STORAGE_KEY, JSON.stringify(Array(30).fill(12)));
    showCard();
    return { statsCount: Object.keys(getStatsStore()).length, cardCount: originalDeck.length };
  });
  expect(setup).toEqual({ statsCount: 11365, cardCount: 2000 });

  const statsBeforeFilter = await page.evaluate(() => {
    openLearningStats();
    const model = buildLearningStatsModel();
    return {
      visible: document.getElementById('learning-stats-modal').style.display,
      todayReview: model.totals.todayReview.size,
      otherStudy: model.totals.otherStudy.size,
      totalStudy: model.totals.totalStudy.size,
      syntheticReview: model.decks.get('Synthetic').todayReview.size,
      labels: document.getElementById('learning-stats-summary').innerText
    };
  });
  expect(statsBeforeFilter).toMatchObject({
    visible: 'flex', todayReview: 600, otherStudy: 0, totalStudy: 0, syntheticReview: 600
  });
  expect(statsBeforeFilter.labels).not.toContain('오늘 새로');
  await page.evaluate(() => closeLearningStats());

  const safetyAndTiming = await page.evaluate(() => {
    localStorage.setItem(REVIEW_DURATION_STORAGE_KEY, '{broken');
    const corruptedFallback = getRepresentativeReviewSeconds();
    localStorage.setItem(REVIEW_DURATION_STORAGE_KEY, JSON.stringify([...Array(29).fill(9), 1, 61]));
    const insufficientFallback = getRepresentativeReviewSeconds();
    localStorage.setItem(REVIEW_DURATION_STORAGE_KEY, JSON.stringify([...Array(15).fill(8), ...Array(15).fill(16), 1, 61]));
    const median = getRepresentativeReviewSeconds();
    reviewTimingState = { cardId: String(activeDeck[0].id), startedAt: performance.now() - 61000, invalid: false };
    const over60Recorded = recordReviewDuration(activeDeck[0]);
    beginReviewTiming(activeDeck[0]);
    window.dispatchEvent(new Event('blur'));
    const blurRecorded = recordReviewDuration(activeDeck[0]);
    const buildStartedAt = performance.now();
    const first = buildTodayEssentialCandidates();
    const buildElapsedMs = performance.now() - buildStartedAt;
    const second = buildTodayEssentialCandidates();
    const startupSelection = selectSafeBackupIndexRecord({
      100: { statsKeyCount: 11365 },
      200: { statsKeyCount: 240 }
    });
    return {
      corruptedFallback,
      insufficientFallback,
      median,
      over60Recorded,
      blurRecorded,
      buildElapsedMs,
      deterministic: first.ranked.map(item => item.card.id).join('|') === second.ranked.map(item => item.card.id).join('|'),
      startupSelected: startupSelection && startupSelection.ts
    };
  });
  expect(safetyAndTiming).toMatchObject({
    corruptedFallback: 12,
    insufficientFallback: 12,
    median: 12,
    over60Recorded: false,
    blurRecorded: false,
    deterministic: true,
    startupSelected: '100'
  });
  expect(safetyAndTiming.buildElapsedMs).toBeLessThan(1000);

  await page.evaluate(() => localStorage.setItem(REVIEW_DURATION_STORAGE_KEY, JSON.stringify(Array(30).fill(12))));
  await page.evaluate(() => document.getElementById('filter-due').click());
  expect(await page.evaluate(() => activeDeck.length)).toBe(600);

  await page.evaluate(() => document.getElementById('filter-essential').click());
  await expect(page.locator('#essential-sheet-overlay')).toHaveClass(/open/);
  await expect(page.locator('.essential-preset')).toHaveCount(3);
  await page.locator('.essential-preset').nth(0).click();
  await expect(page.locator('#essential-selection')).toContainText('150개');
  await page.locator('.essential-preset').nth(1).click();
  await expect(page.locator('#essential-selection')).toContainText('300개');
  await page.locator('.essential-preset').nth(2).click();
  await expect(page.locator('#essential-selection')).toContainText('600개');

  await page.evaluate(() => {
    const range = document.getElementById('essential-range');
    range.value = todayEssentialState.prepared.options.indexOf(250);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#essential-selection')).toContainText('250개');
  await page.click('.essential-start');
  expect(await page.evaluate(() => ({ active: todayEssentialState.active, selected: activeDeck.length })))
    .toEqual({ active: true, selected: 250 });

  await page.click('#click-guide');
  await page.click('.g-btn.bg-o');
  await page.click('#click-guide');
  await page.click('.g-btn.bg-x');
  await page.click('#click-guide');
  await page.click('.g-btn.bg-o');
  await page.waitForTimeout(200);

  const afterReviews = await page.evaluate(async () => {
    const db = await openYokiIndexedDB();
    const idbStats = await new Promise((resolve, reject) => {
      const request = db.transaction(YOKI_IDB_STORE, 'readonly').objectStore(YOKI_IDB_STORE).get(YOKI_IDB_STATS_KEY);
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    });
    db.close();
    return {
      statsCount: Object.keys(getStatsStore()).length,
      idbStatsCount: Object.keys(idbStats).length,
      processed: todayEssentialState.processedIds.size,
      backupSafety: [
        evaluateBackupStatsSafety(0, 11365),
        evaluateBackupStatsSafety(240, 11365),
        evaluateBackupStatsSafety(11365, 11365)
      ],
      audit: window.__YOPLE_FIREBASE_AUDIT__
    };
  });
  expect(afterReviews.statsCount).toBe(11365);
  expect(afterReviews.idbStatsCount).toBe(11365);
  expect(afterReviews.processed).toBe(3);
  expect(afterReviews.backupSafety.map(item => item.allowed)).toEqual([false, false, true]);
  expect(afterReviews.audit.writes).toBe(0);
  expect(afterReviews.audit.deletes).toBe(0);
  expect(afterReviews.audit.metadataUpdates).toBe(0);
  expect(afterReviews.audit.blockedBackupCalls).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => {
    const prepared = buildTodayEssentialCandidates();
    const completedIds = new Set(todayEssentialState.processedIds);
    return {
      candidateCount: prepared.candidates.length,
      completedStillIncluded: prepared.candidates.some(card => completedIds.has(getTodayEssentialCardId(card)))
    };
  })).toEqual({ candidateCount: 597, completedStillIncluded: false });
  expect(await page.evaluate(() => {
    const model = buildLearningStatsModel();
    return {
      todayReview: model.totals.todayReview.size,
      otherStudy: model.totals.otherStudy.size,
      totalStudy: model.totals.totalStudy.size
    };
  })).toEqual({ todayReview: 600, otherStudy: 0, totalStudy: 3 });
  console.log('SAFE_REAPPLY_METRICS', JSON.stringify({
    candidateBuildMs: Math.round(safetyAndTiming.buildElapsedMs * 10) / 10,
    statsCount: afterReviews.statsCount,
    idbStatsCount: afterReviews.idbStatsCount,
    firebaseWrites: afterReviews.audit.writes,
    firebaseDeletes: afterReviews.audit.deletes,
    firebaseMetadataUpdates: afterReviews.audit.metadataUpdates
  }));

  await page.evaluate(() => document.getElementById('filter-essential').click());
  await expect(page.locator('#essential-release')).toBeVisible();
  await page.evaluate(() => {
    const range = document.getElementById('essential-range');
    range.value = todayEssentialState.prepared.options.indexOf(100);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('.essential-start');
  expect(await page.evaluate(() => activeDeck.length)).toBe(100);

  await page.evaluate(() => document.getElementById('filter-essential').click());
  await page.click('#essential-release');
  expect(await page.evaluate(() => ({ active: todayEssentialState.active, count: activeDeck.length })))
    .toEqual({ active: false, count: 597 });

  const completion = await page.evaluate(() => {
    openTodayEssentialSheet();
    const range = document.getElementById('essential-range');
    range.value = todayEssentialState.prepared.options.indexOf(10);
    startTodayEssential();
    todayEssentialState.selectedIds.forEach(id => todayEssentialState.processedIds.add(id));
    showTodayEssentialCompletion();
    return document.getElementById('essential-complete-modal').style.display;
  });
  expect(completion).toBe('flex');
  await page.click('#essential-complete-modal .btn-save');
  expect(await page.evaluate(() => {
    const remainingIds = new Set(activeDeck.map(getTodayEssentialCardId));
    return [...todayEssentialState.processedIds].some(id => remainingIds.has(id));
  })).toBe(false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof getRepresentativeReviewSeconds === 'function');
  expect(await page.evaluate(() => window.__YOPLE_FIREBASE_AUDIT__.writes)).toBe(0);
  expect(firebaseNetworkWrites).toEqual([]);
  expect(consoleErrors.filter(message => !message.includes('Failed to load resource'))).toEqual([]);
});
