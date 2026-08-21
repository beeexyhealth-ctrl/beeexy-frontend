export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback(response: { credential?: string }): void }): void;
          renderButton(element: HTMLElement, options: {
            type: "standard";
            theme: "outline";
            size: "large";
            shape: "rectangular";
            text: "continue_with";
            width: number;
          }): void;
        };
      };
    };
  }
}
