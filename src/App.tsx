import React, { useEffect, useRef, useState } from 'react';
import { Route, Switch, Router as WouterRouter, Link } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import MIDIVidApp from '@/pages/MIDIVidApp';
import PopoutStage from '@/pages/PopoutStage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={MIDIVidApp} />
      <Route path="/popout" component={PopoutStage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Under file:// (Electron desktop build) the pathname is the file's disk
            path, so path-based routing never matches. Use hash-based routing there. */}
        {window.location.protocol === 'file:' ? (
          <WouterRouter hook={useHashLocation}>
            <Router />
          </WouterRouter>
        ) : (
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
