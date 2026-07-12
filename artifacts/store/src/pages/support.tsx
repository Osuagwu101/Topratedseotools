import { Layout } from "@/components/layout";
import { useSiteSettings } from "@/context/siteSettings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Mail, MessageCircle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Support() {
  const { settings } = useSiteSettings();

  const whatsappHref = settings.whatsappNumber
    ? `https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}${
        settings.whatsappMessage ? `?text=${encodeURIComponent(settings.whatsappMessage)}` : ""
      }`
    : null;

  return (
    <Layout>
      <section className="py-20 bg-white border-b border-border">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight mb-4 text-foreground">
            <span className="text-primary">Support</span> Center
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            {settings.supportPageMessage ||
              "For the fastest response, please reach out to us on WhatsApp. We typically reply within minutes."}
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <MessageCircle className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">WhatsApp Support</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Reach us on WhatsApp for the fastest response.
              </p>
              {settings.whatsappEnabled && settings.whatsappNumber ? (
                <Button className="w-full bg-primary hover:bg-primary/90 text-white font-bold" asChild>
                  <a href={whatsappHref!} target="_blank" rel="noopener noreferrer" className="w-full">
                    <MessageCircle className="w-4 h-4 mr-2" /> Chat on WhatsApp
                  </a>
                </Button>
              ) : (
                <Button disabled className="w-full" variant="outline">
                  WhatsApp unavailable
                </Button>
              )}
            </Card>

            <Card className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
                <Mail className="w-7 h-7 text-accent-foreground" />
              </div>
              <h2 className="text-xl font-bold mb-2">Email Us</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Prefer email? Send us a message and we will get back to you.
              </p>
              {settings.businessEmail ? (
                <Button className="w-full font-bold" variant="outline" asChild>
                  <a href={`mailto:${settings.businessEmail}`} className="w-full">
                    <Mail className="w-4 h-4 mr-2" /> {settings.businessEmail}
                  </a>
                </Button>
              ) : (
                <Button disabled className="w-full" variant="outline">
                  Email unavailable
                </Button>
              )}
            </Card>
          </div>
        </div>
      </section>
    </Layout>
  );
}
