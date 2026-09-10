"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Lets the browser restore the existing WebGL context after a transient GPU
 * reset (tab suspension, driver reset, or temporary context pressure).
 * Without preventDefault(), a lost context is terminal for this canvas.
 */
export function WebGLContextRecovery() {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
    };

    const handleContextRestored = () => {
      gl.resetState();
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored, false);
    };
  }, [gl, invalidate]);

  return null;
}
