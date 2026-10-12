import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { listInterfaceImages } from "../lib/interface-images";

export const Route = createFileRoute("/interface")({
  head: () => ({
    title: "Interface Reference",
    meta: [
      {
        name: "description",
        content: "Screenshot reference for all app sections.",
      },
    ],
  }),
  component: InterfacePage,
});

function InterfacePage() {
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    listInterfaceImages().then((files) => setImages(files));
  }, []);

  return (
    <div >
      {images.map((src) => (
        <div key={src} >
          <img
            src={src}
            alt={src}
            
          />
        </div>
      ))}
    </div>
  );
}
