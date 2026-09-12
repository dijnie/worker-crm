"use client";

import { Component, useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import type SwaggerUIComponent from "swagger-ui-react";
import { Button } from "@/components/ui/button";
import "swagger-ui-react/swagger-ui.css";
import "@/styles/api-docs.css";

type SwaggerUIProps = ComponentProps<typeof SwaggerUIComponent>;

type DocumentationBoundaryProps = { children: ReactNode; fallback: ReactNode };

// The React wrapper omits validatorUrl, so supply it through the plugin system.
// Read the instance configuration without modifying Swagger's frozen defaults.
function LocalValidationConfig(system: { getConfigs: () => Record<string, unknown> }) {
  const getConfigs = system.getConfigs;
  return {
    rootInjects: {
      getConfigs: () => ({ ...getConfigs(), validatorUrl: null }),
    },
  };
}

const swaggerPlugins = [LocalValidationConfig];

class DocumentationBoundary extends Component<DocumentationBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ApiDocumentation() {
  const [SwaggerUI, setSwaggerUI] = useState<ComponentType<SwaggerUIProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSwaggerUI(null);

    // Import only after hydration: Swagger accesses browser APIs during module evaluation.
    import("swagger-ui-react").then((module) => {
      if (!active) return;
      setSwaggerUI(() => module.default);
    }).catch(() => {
      if (active) setFailed(true);
    });

    return () => { active = false; };
  }, [attempt]);

  const error = (
    <div role="alert" className="space-y-3 rounded-lg border bg-card p-6">
      <p className="font-medium">API documentation could not load.</p>
      <p className="text-sm text-muted-foreground">Retry the interactive viewer, or open the OpenAPI JSON above.</p>
      <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
    </div>
  );

  if (failed) return error;
  if (!SwaggerUI) {
    return <p role="status" className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading API documentation…</p>;
  }

  return (
    <DocumentationBoundary key={attempt} fallback={error}>
      <section className="api-docs" aria-label="Interactive API reference">
        <SwaggerUI
          url="/api/openapi"
          plugins={swaggerPlugins}
          filter
          deepLinking
          docExpansion="list"
          defaultModelsExpandDepth={1}
          displayRequestDuration
          persistAuthorization={false}
          queryConfigEnabled={false}
        />
      </section>
    </DocumentationBoundary>
  );
}
