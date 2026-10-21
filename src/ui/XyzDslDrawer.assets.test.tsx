// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { XyzDslDrawer } from './XyzDslDrawer';
afterEach(() => { cleanup(); localStorage.clear(); });
it('makes assets reachable alongside the explorer object and data tabs', () => {
  const props: ComponentProps<typeof XyzDslDrawer> = {
    appMode: 'editor', isOpen: true, document: createSpatialDocument(''),
    transactionPublicKey: '', transactionRange: { startHeight: 0, endHeight: 0, limit: 500 },
    transactionsLoading: false, tipLoading: false, transactionCount: 0, acceptedTransactionCount: 0,
    mappedTransactionSource: '', hasRemoteBaseline: false, hasAuthoringEdits: false,
    remoteBaselineChanged: false, authoringChangeSummary: { added: 0, removed: 0 },
    source: '', rejectedTransactions: [], secondaryTenants: [],
    selectionPath: [], selectedNodeCanEdit: false, linearStepChoice: 'auto', rotationStep: 1,
    onChange: vi.fn(),
    onModeChange: vi.fn(),
    onResetToRemote: vi.fn(),
    onTransactionPublicKeyChange: vi.fn(),
    onTransactionRangeChange: vi.fn(),
    onReloadTransactions: vi.fn(),
    onUseTransactionTip: vi.fn(),
    onSecondaryReplay: vi.fn(),
    onSecondaryPlaybackToggle: vi.fn(),
    onSecondaryPlaybackSpeedChange: vi.fn(),
    onSecondaryPlaybackSeek: vi.fn(),
    onLoadSecondaryHistory: vi.fn(),
    onSecondaryEnabledChange: vi.fn(),
    onSecondaryRangeChange: vi.fn(),
    onClearSelection: vi.fn(),
    onMoveNode: vi.fn(),
    onResizeNode: vi.fn(),
    onRotateNode: vi.fn(),
    onPathNodeSelect: vi.fn(),
    onNodePropertyChange: vi.fn(),
    onLinearStepChoiceChange: vi.fn(),
    onRotationStepChange: vi.fn(),
    assetsPanel: <p>Folder controls</p>,
  };
  render(<XyzDslDrawer {...props} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
  expect(screen.getByText('Folder controls')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Objects' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Data' })).toBeTruthy();
});
