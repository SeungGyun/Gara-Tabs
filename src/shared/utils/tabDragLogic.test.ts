import { describe, it, expect } from 'vitest';
import {
  buildSegments,
  resolveDropPosition,
  computeTabMoveTarget,
  computeTabToGroupTarget,
  adjustIndexForMove,
  computeFinalPosition,
  willActuallyMove,
  type SimpleTab,
} from './tabDragLogic';

// ── 헬퍼 ──

function tab(id: number, index: number, groupId = -1, pinned = false): SimpleTab {
  return { id, index, groupId, pinned };
}

// ══════════════════════════════════════
// buildSegments
// ══════════════════════════════════════

describe('buildSegments', () => {
  it('빈 탭 배열 → 빈 세그먼트', () => {
    expect(buildSegments([], new Set())).toEqual([]);
  });

  it('고정 탭만 → pinned 세그먼트 1개', () => {
    const tabs = [tab(1, 0, -1, true), tab(2, 1, -1, true)];
    const result = buildSegments(tabs, new Set());
    expect(result).toEqual([{ kind: 'pinned', tabs }]);
  });

  it('미분류 탭만 → 개별 ungrouped 세그먼트', () => {
    const tabs = [tab(1, 0), tab(2, 1), tab(3, 2)];
    const result = buildSegments(tabs, new Set());
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: 'ungrouped', tab: tabs[0] });
    expect(result[1]).toEqual({ kind: 'ungrouped', tab: tabs[1] });
    expect(result[2]).toEqual({ kind: 'ungrouped', tab: tabs[2] });
  });

  it('그룹 1개 → group 세그먼트 1개', () => {
    const tabs = [tab(1, 0, 100), tab(2, 1, 100), tab(3, 2, 100)];
    const result = buildSegments(tabs, new Set([100]));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ kind: 'group', groupId: 100, tabs });
  });

  it('크롬 실제 순서 반영: 그룹-미분류-그룹', () => {
    const tabs = [
      tab(1, 0, 100), tab(2, 1, 100), // group 100
      tab(3, 2),                        // ungrouped
      tab(4, 3, 200), tab(5, 4, 200), // group 200
    ];
    const result = buildSegments(tabs, new Set([100, 200]));
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: 'group', groupId: 100, tabs: [tabs[0], tabs[1]] });
    expect(result[1]).toEqual({ kind: 'ungrouped', tab: tabs[2] });
    expect(result[2]).toEqual({ kind: 'group', groupId: 200, tabs: [tabs[3], tabs[4]] });
  });

  it('고정-그룹-미분류-미분류 복합 순서', () => {
    const tabs = [
      tab(1, 0, -1, true),            // pinned
      tab(2, 1, 100), tab(3, 2, 100), // group 100
      tab(4, 3),                        // ungrouped
      tab(5, 4),                        // ungrouped
    ];
    const result = buildSegments(tabs, new Set([100]));
    expect(result).toHaveLength(4);
    expect(result[0].kind).toBe('pinned');
    expect(result[1]).toEqual({ kind: 'group', groupId: 100, tabs: [tabs[1], tabs[2]] });
    expect(result[2]).toEqual({ kind: 'ungrouped', tab: tabs[3] });
    expect(result[3]).toEqual({ kind: 'ungrouped', tab: tabs[4] });
  });

  it('정렬되지 않은 입력도 index 기준 정렬', () => {
    const tabs = [tab(3, 2), tab(1, 0, 100), tab(2, 1, 100)];
    const result = buildSegments(tabs, new Set([100]));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ kind: 'group', groupId: 100, tabs: [tabs[1], tabs[2]] });
    expect(result[1]).toEqual({ kind: 'ungrouped', tab: tabs[0] });
  });

  it('미분류-그룹-미분류 순서', () => {
    const tabs = [
      tab(1, 0),                        // ungrouped
      tab(2, 1, 100), tab(3, 2, 100), // group 100
      tab(4, 3),                        // ungrouped
    ];
    const result = buildSegments(tabs, new Set([100]));
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ kind: 'ungrouped', tab: tabs[0] });
    expect(result[1]).toEqual({ kind: 'group', groupId: 100, tabs: [tabs[1], tabs[2]] });
    expect(result[2]).toEqual({ kind: 'ungrouped', tab: tabs[3] });
  });
});

// ══════════════════════════════════════
// resolveDropPosition — 인접 탭 no-op 방지
// ══════════════════════════════════════

describe('resolveDropPosition', () => {
  it('바로 위 탭 → before를 after로 보정', () => {
    // src=3, tgt=4: src가 tgt 바로 위. 'before'는 no-op이므로 'after'로
    expect(resolveDropPosition(3, 4, 'before')).toBe('after');
  });

  it('바로 아래 탭 → after를 before로 보정', () => {
    // src=4, tgt=3: src가 tgt 바로 아래. 'after'는 no-op이므로 'before'로
    expect(resolveDropPosition(4, 3, 'after')).toBe('before');
  });

  it('바로 위 탭이지만 after → 보정 없음', () => {
    expect(resolveDropPosition(3, 4, 'after')).toBe('after');
  });

  it('바로 아래 탭이지만 before → 보정 없음', () => {
    expect(resolveDropPosition(4, 3, 'before')).toBe('before');
  });

  it('인접하지 않은 탭 → 보정 없음', () => {
    expect(resolveDropPosition(0, 5, 'before')).toBe('before');
    expect(resolveDropPosition(0, 5, 'after')).toBe('after');
    expect(resolveDropPosition(5, 0, 'before')).toBe('before');
    expect(resolveDropPosition(5, 0, 'after')).toBe('after');
  });

  it('같은 인덱스 (이론상 불가) → 보정 없음', () => {
    expect(resolveDropPosition(3, 3, 'before')).toBe('before');
    expect(resolveDropPosition(3, 3, 'after')).toBe('after');
  });
});

// ══════════════════════════════════════
// computeTabMoveTarget
// ══════════════════════════════════════

describe('computeTabMoveTarget', () => {
  it('before: 대상 탭의 인덱스 그대로', () => {
    expect(computeTabMoveTarget(5, 'before')).toBe(5);
  });

  it('after: 대상 탭의 인덱스 + 1', () => {
    expect(computeTabMoveTarget(5, 'after')).toBe(6);
  });
});

// ══════════════════════════════════════
// computeTabToGroupTarget
// ══════════════════════════════════════

describe('computeTabToGroupTarget', () => {
  const groupTabs = [tab(10, 3, 100), tab(11, 4, 100), tab(12, 5, 100)];

  it('into: 그룹 마지막 탭 뒤, 해당 그룹으로', () => {
    const result = computeTabToGroupTarget(groupTabs, 'into');
    expect(result).toEqual({ targetIndex: 6, targetGroupId: 100 });
  });

  it('before: 그룹 첫 탭 앞, 미분류로', () => {
    const result = computeTabToGroupTarget(groupTabs, 'before');
    expect(result).toEqual({ targetIndex: 3, targetGroupId: -1 });
  });

  it('after: 그룹 마지막 탭 뒤, 미분류로', () => {
    const result = computeTabToGroupTarget(groupTabs, 'after');
    expect(result).toEqual({ targetIndex: 6, targetGroupId: -1 });
  });
});

// ══════════════════════════════════════
// adjustIndexForMove — chrome.tabs.move 시뮬레이션
// ══════════════════════════════════════

describe('adjustIndexForMove', () => {
  it('src < target → target - 1', () => {
    expect(adjustIndexForMove(2, 5)).toBe(4);
  });

  it('src > target → target 그대로', () => {
    expect(adjustIndexForMove(5, 2)).toBe(2);
  });

  it('src === target → target 그대로', () => {
    expect(adjustIndexForMove(3, 3)).toBe(3);
  });
});

// ══════════════════════════════════════
// willActuallyMove — 실제 이동 여부 검증
// ══════════════════════════════════════

describe('willActuallyMove', () => {
  it('같은 위치 → 이동 안함', () => {
    expect(willActuallyMove(3, 3)).toBe(false);
  });

  it('src+1 위치로 → 이동 안함 (adjust로 제자리)', () => {
    // src=3, target=4 → adjusted=3 → 제자리
    expect(willActuallyMove(3, 4)).toBe(false);
  });

  it('src+2 위치로 → 이동함', () => {
    // src=3, target=5 → adjusted=4 → 이동
    expect(willActuallyMove(3, 5)).toBe(true);
  });

  it('src-1 위치로 → 이동함', () => {
    // src=3, target=2 → adjusted=2 → 이동
    expect(willActuallyMove(3, 2)).toBe(true);
  });

  it('먼 거리 → 이동함', () => {
    expect(willActuallyMove(0, 10)).toBe(true);
    expect(willActuallyMove(10, 0)).toBe(true);
  });
});

// ══════════════════════════════════════
// 통합 시나리오: 드래그 앤 드롭 전체 흐름 검증
// ══════════════════════════════════════

describe('드래그 앤 드롭 통합 시나리오', () => {
  // 그룹 내 탭: [A=3, B=4, C=5] (groupId=100)

  describe('그룹 첫 번째 탭(A) 아래로 이동', () => {
    it('A→B before: 보정 후 after, 이동 성공', () => {
      const pos = resolveDropPosition(3, 4, 'before');
      expect(pos).toBe('after'); // 보정됨
      const target = computeTabMoveTarget(4, pos);
      expect(target).toBe(5); // B 뒤
      expect(willActuallyMove(3, target)).toBe(true);
      expect(computeFinalPosition(3, target)).toBe(4); // A가 index 4로 이동
    });

    it('A→B after: 보정 없음, 이동 성공', () => {
      const pos = resolveDropPosition(3, 4, 'after');
      expect(pos).toBe('after');
      const target = computeTabMoveTarget(4, pos);
      expect(target).toBe(5);
      expect(willActuallyMove(3, target)).toBe(true);
      expect(computeFinalPosition(3, target)).toBe(4);
    });

    it('A→C before: 보정 없음, 이동 성공', () => {
      const pos = resolveDropPosition(3, 5, 'before');
      expect(pos).toBe('before');
      const target = computeTabMoveTarget(5, pos);
      expect(target).toBe(5);
      expect(willActuallyMove(3, target)).toBe(true);
      expect(computeFinalPosition(3, target)).toBe(4);
    });
  });

  describe('그룹 마지막 탭(C) 위로 이동', () => {
    it('C→B after: 보정 후 before, 이동 성공', () => {
      const pos = resolveDropPosition(5, 4, 'after');
      expect(pos).toBe('before'); // 보정됨
      const target = computeTabMoveTarget(4, pos);
      expect(target).toBe(4); // B 앞
      expect(willActuallyMove(5, target)).toBe(true);
      expect(computeFinalPosition(5, target)).toBe(4); // C가 index 4로 이동
    });

    it('C→A before: 보정 없음, 이동 성공', () => {
      const pos = resolveDropPosition(5, 3, 'before');
      expect(pos).toBe('before');
      const target = computeTabMoveTarget(3, pos);
      expect(target).toBe(3);
      expect(willActuallyMove(5, target)).toBe(true);
      expect(computeFinalPosition(5, target)).toBe(3);
    });
  });

  describe('그룹 간 이동', () => {
    it('그룹1의 탭(idx=1)을 그룹2의 탭(idx=5) before로', () => {
      const pos = resolveDropPosition(1, 5, 'before');
      expect(pos).toBe('before');
      const target = computeTabMoveTarget(5, pos);
      expect(target).toBe(5);
      expect(willActuallyMove(1, target)).toBe(true);
      expect(computeFinalPosition(1, target)).toBe(4);
    });
  });

  describe('미분류 탭 이동', () => {
    it('미분류 탭(idx=2)을 다른 미분류 탭(idx=5) after로', () => {
      const pos = resolveDropPosition(2, 5, 'after');
      expect(pos).toBe('after');
      const target = computeTabMoveTarget(5, pos);
      expect(target).toBe(6);
      expect(willActuallyMove(2, target)).toBe(true);
      expect(computeFinalPosition(2, target)).toBe(5);
    });
  });

  describe('탭을 그룹 헤더에 드롭', () => {
    const groupTabs = [tab(10, 3, 100), tab(11, 4, 100), tab(12, 5, 100)];

    it('외부 탭(idx=0)을 그룹 안으로(into)', () => {
      const { targetIndex, targetGroupId } = computeTabToGroupTarget(groupTabs, 'into');
      expect(targetIndex).toBe(6);
      expect(targetGroupId).toBe(100);
      expect(willActuallyMove(0, targetIndex)).toBe(true);
    });

    it('외부 탭(idx=0)을 그룹 앞으로(before)', () => {
      const { targetIndex, targetGroupId } = computeTabToGroupTarget(groupTabs, 'before');
      expect(targetIndex).toBe(3);
      expect(targetGroupId).toBe(-1);
      expect(willActuallyMove(0, targetIndex)).toBe(true);
    });
  });
});
