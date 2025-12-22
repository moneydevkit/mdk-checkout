{
  description = "mdk-checkout development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24 # JavaScript runtime
            cypress # E2E testing framework
          ];

          env = {
            # The auto-downloaded Cypress binary is not compatible Nix. We tell Cypress to use the binary from nixpkgs instead.
            CYPRESS_INSTALL_BINARY = 0;
            CYPRESS_RUN_BINARY = "${pkgs.cypress}/bin/Cypress";
          };

          shellHook = ''
            echo "Money Dev Kit Checkout Development Environment"
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"

            # Check for Cypress version mismatch. A mismatch could cause compatibility issues which can occur when updating Cypress.
            if [ -f package.json ]; then
              PKG_VERSION=$(npm pkg get devDependencies.cypress 2>/dev/null | tr -d '"')
              NIX_VERSION="${pkgs.cypress.version}"

              if [ -n "$PKG_VERSION" ] && [ -n "$NIX_VERSION" ] && [ "$PKG_VERSION" != "$NIX_VERSION" ]; then
                echo ""
                echo "⚠️  WARNING: Cypress version mismatch detected!"
                echo "package.json: $PKG_VERSION"
                echo "nixpkgs:      $NIX_VERSION"
                echo "This may cause compatibility issues."
                echo "To resolve:"
                echo "  npm install cypress@$NIX_VERSION --save-dev --save-exact"
                echo "Then reload the shell."
                echo ""
              fi
            fi

            # Install node modules if they don't exist or are out of date
            if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
              echo "Installing dependencies"
              npm ci
            fi

            # Create .env.local for demo app if it doesn't exist
            # This is required to run the e2e tests against the mock API.
            if [ ! -f examples/mdk-nextjs-demo/.env.local ]; then
              echo "Creating .env.local for demo app"
              cat > examples/mdk-nextjs-demo/.env.local <<EOF
NEXT_PUBLIC_MDK_API_PATH=/api/mdk-mock
MDK_API_PATH=/api/mdk-mock
EOF
            fi

            # Prepare demo app if dependency tarballs don't exist
            if [ ! -f examples/mdk-nextjs-demo/moneydevkit-core-local.tgz ] || [ ! -f examples/mdk-nextjs-demo/moneydevkit-nextjs-local.tgz ]; then
              echo "Dependency tarballs not found, preparing demo app..."
              ./scripts/prepare-demo
            fi

            echo "Development environment ready"
            echo "================================================"
          '';
        };
      }
    );
}
