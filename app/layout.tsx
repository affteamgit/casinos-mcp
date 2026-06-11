export const metadata = {
  title: "Casino Kings MCP",
  description: "MCP server for bitcoincasinokings.com APIs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
