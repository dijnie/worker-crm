"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Component, useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import type SwaggerUIComponent from "swagger-ui-react";
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

// Authentication belongs to the app's sign-in page. Keep cookie security metadata
// while suppressing Swagger controls that ask users to paste HttpOnly cookies.
function SessionAuthenticationControls() {
  return {
    components: {
      authorizeBtn: () => null,
      authorizeOperationBtn: () => null,
      authorizationPopup: () => null,
    },
  };
}

const swaggerPlugins = [LocalValidationConfig, SessionAuthenticationControls];

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
    <Card role="alert">
      <CardContent className="gap-3">
        <p className="text-sm font-medium">API documentation could not load.</p>
        <p className="text-xs/relaxed text-muted-foreground">Retry the interactive viewer, or open the OpenAPI JSON above.</p>
        <Button variant="outline" className="self-start" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
      </CardContent>
    </Card>
  );

  if (failed) return error;
  if (!SwaggerUI) {
    return (
      <Card role="status" aria-busy="true" aria-label="Loading API documentation">
        <CardContent className="gap-4">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    );
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
