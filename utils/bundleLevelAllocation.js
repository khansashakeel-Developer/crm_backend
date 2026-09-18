// utils/bundleLevelAllocation.js
//
// Shared helper for splitting a bundle invoice's gross/discount/paid amounts
// across its program levels (Level 1, Level 2, Level 3, ...).
//
// Business rule (confirmed by Khansa, 2026-09-16):
//   - Discount is ALWAYS applied entirely to whichever item is "level 2",
//     regardless of whether the bundle has 2 or 3+ levels.
//   - Payments waterfall sequentially by level number: a level only starts
//     receiving payment once the previous level's NET (post-discount)
//     amount is fully paid. Array order in items[] does NOT determine
//     level order — only Program.level does (confirmed against real
//     invoices where items[] order was inconsistent).

/**
 * @param {Array<{ enrollment: string, program: string, level: string, amount: number }>} items
 *        Only "program" feeType items (i.e. actual bundle levels) — do not
 *        pass certificate/manual fee items into this function.
 * @param {number} discountAmount - the whole invoice's discountAmount
 * @param {number} paidAmount - the whole invoice's paidAmount so far
 * @returns {Array<{ enrollment, program, level, gross, discount, net, paid, remaining }>}
 */
function allocateBundleLevels(items, discountAmount, paidAmount) {
  const sorted = [...items].sort((a, b) => {
    const numA = parseInt(String(a.level).replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.level).replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  let remainingPayment = Number(paidAmount) || 0;

  return sorted.map((item) => {
    const gross = Number(item.amount) || 0;
    const discount = item.level === "level 2" ? Number(discountAmount) || 0 : 0;
    const net = Math.max(0, gross - discount);

    const paid = Math.min(net, remainingPayment);
    remainingPayment = Math.max(0, remainingPayment - paid);
    const remaining = net - paid;

    return {
      enrollment: item.enrollment?.toString(),
      program: item.program?.toString(),
      level: item.level,
      gross,
      discount,
      net,
      paid,
      remaining,
    };
  });
}

/**
 * Maps each ACTUAL PAYMENT (advance + installments, in chronological order)
 * to whichever level was "open" in the waterfall at the time.
 *
 * Since installment records are stored at the whole-invoice level (not
 * per-level), this infers the split by walking through payments in order
 * and filling each level's net target sequentially — exactly mirroring
 * allocateBundleLevels, but at installment granularity instead of just
 * a single total. A single installment can be split across two levels
 * if it straddles a level boundary.
 *
 * @param {Array} items - same shape as allocateBundleLevels: [{ enrollment, program, level, amount }]
 * @param {number} discountAmount - whole invoice's discountAmount (applied to level 2 only)
 * @param {Array} installments - the invoice's raw installments[] array (each with amount, paidAmount, paidAt, isAdvance)
 * @returns {Map<string, { advance: {date, amount}|null, installments: Array<{date, amount}> }>}
 *          keyed by enrollment id (string)
 */
function allocateInstallmentsToLevels(items, discountAmount, installments) {
  const sorted = [...items].sort((a, b) => {
    const numA = parseInt(String(a.level).replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(String(b.level).replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  const levelQueue = sorted.map((it) => {
    const gross = Number(it.amount) || 0;
    const discount = it.level === "level 2" ? Number(discountAmount) || 0 : 0;
    return {
      enrollment: it.enrollment?.toString(),
      remaining: Math.max(0, gross - discount),
    };
  });

  const result = new Map();
  levelQueue.forEach((l) => result.set(l.enrollment, { advance: null, installments: [] }));

  // Only consider installments that have actually been paid, in chronological order.
  // Fall back to array order if paidAt is missing (assume array order = payment order).
  const paidInstallments = (installments || [])
    .filter((inst) => Number(inst.paidAmount) > 0)
    .map((inst, idx) => ({ ...(inst.toObject ? inst.toObject() : inst), _origIndex: idx }))
    .sort((a, b) => {
      const dateA = a.paidAt ? new Date(a.paidAt).getTime() : null;
      const dateB = b.paidAt ? new Date(b.paidAt).getTime() : null;
      if (dateA !== null && dateB !== null) return dateA - dateB;
      return a._origIndex - b._origIndex;
    });

  let levelIndex = 0;

  for (const inst of paidInstallments) {
    let remainingInstallmentAmount = Number(inst.paidAmount) || 0;

    while (remainingInstallmentAmount > 0 && levelIndex < levelQueue.length) {
      const level = levelQueue[levelIndex];
      const portion = Math.min(level.remaining, remainingInstallmentAmount);

            if (portion > 0) {
        const bucket = result.get(level.enrollment);
        const entry = { date: inst.paidAt || null, amount: portion };

        // Whichever payment (or partial spillover) is the FIRST money to
        // reach this level counts as that level's "advance" — regardless
        // of whether it came from the invoice's actual advance payment or
        // from a later installment/spillover.
        if (!bucket.advance) {
          bucket.advance = entry;
        } else {
          bucket.installments.push(entry);
        }

        level.remaining -= portion;
        remainingInstallmentAmount -= portion;
      }

      if (level.remaining === 0) levelIndex += 1;
    }
    // If remainingInstallmentAmount > 0 here, total paid exceeds sum of all levels' net —
    // shouldn't normally happen; any excess is silently dropped rather than misattributed.
  }

  return result;
}

module.exports = { allocateBundleLevels, allocateInstallmentsToLevels };