// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PressAndHoldButton } from './PressAndHoldButton';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each(['Enter', ' '])('continuously applies the latest transform while holding %s, then stops on release', key => {
  vi.useFakeTimers();
  function Transform() {
    const [rotation, setRotation] = useState(0);
    return <PressAndHoldButton onActivate={() => setRotation(rotation + 1)}>{rotation}</PressAndHoldButton>;
  }
  render(<Transform />);
  const button = screen.getByRole('button');
  fireEvent.keyDown(button, { key });
  expect(button.textContent).toBe('1');
  act(() => vi.advanceTimersByTime(425));
  expect(button.textContent).toBe('2');
  fireEvent.keyDown(button, { key, repeat: true });
  act(() => vi.advanceTimersByTime(75));
  expect(button.textContent).toBe('3');
  fireEvent.keyUp(button, { key });
  fireEvent.click(button);
  act(() => vi.advanceTimersByTime(1000));
  expect(button.textContent).toBe('3');
});

it('stops a held transform when focus leaves the button', () => {
  vi.useFakeTimers();
  const activate = vi.fn();
  render(<PressAndHoldButton onActivate={activate}>Move</PressAndHoldButton>);
  const button = screen.getByRole('button');
  fireEvent.keyDown(button, { key: 'Enter' });
  fireEvent.blur(button);
  act(() => vi.advanceTimersByTime(1000));
  expect(activate).toHaveBeenCalledTimes(1);
});
