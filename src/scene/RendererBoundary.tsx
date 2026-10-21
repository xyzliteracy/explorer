import { Component, type ReactNode } from 'react';

/** Kept outside Fiber so renderer creation failures have a usable DOM fallback. */
export class RendererBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="scene-preparation" role="alert">
      <span>The 3D viewer could not start.</span>
      <button onClick={this.props.onRetry}>Retry with reduced graphics</button>
    </div>;
    return this.props.children;
  }
}
