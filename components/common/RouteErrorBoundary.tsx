import React from 'react';

interface Props {
    routeName?: string;
    children: React.ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Prevents a single lazy-loaded route from blanking the entire app.
 * Any thrown render error is caught, logged, and replaced with a small
 * diagnostic card so the shell (sidebar, header, nav) stays interactive.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error(`[RouteErrorBoundary${this.props.routeName ? ` · ${this.props.routeName}` : ''}]`, error, info?.componentStack);
    }

    private handleReload = () => {
        this.setState({ error: null });
        try { window.location.reload(); } catch { /* ignore */ }
    };

    private handleDismiss = () => {
        this.setState({ error: null });
    };

    render() {
        if (this.state.error) {
            return (
                <div className="p-6">
                    <div className="max-w-2xl mx-auto bg-white border border-red-200 rounded-xl shadow-sm p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 font-bold">!</div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900">This screen hit an unexpected error</h3>
                                <p className="text-sm text-gray-600 mt-1">
                                    {this.props.routeName ? `The "${this.props.routeName}" screen` : 'This screen'} failed to render. Your data is safe — try reloading. If it keeps happening, share the message below with support.
                                </p>
                                <pre className="mt-3 text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-40 text-gray-700">
{String(this.state.error?.message || this.state.error)}
                                </pre>
                                <div className="mt-4 flex gap-2">
                                    <button onClick={this.handleReload} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90">Reload</button>
                                    <button onClick={this.handleDismiss} className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50">Try again</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children as React.ReactElement;
    }
}

export default RouteErrorBoundary;
