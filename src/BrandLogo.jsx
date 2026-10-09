import React, { useId } from "react";
import logo from "./assets/sofrimentacao-logo.png";
import "./brand-logo.css";

export function BrandLogo() {
  const maskId = `wordmark-${useId()}`;
  return (
    <svg
      className="brand-logo"
      viewBox="30 214 2132 298"
      role="img"
      aria-label="Sofrimentação."
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x="30"
          y="214"
          width="2132"
          height="298"
          style={{ maskType: "luminance" }}
        >
          <image href={logo} width="2172" height="724" />
        </mask>
      </defs>
      <rect
        x="30"
        y="214"
        width="2132"
        height="298"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
