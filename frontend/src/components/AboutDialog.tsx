import { Dialog } from './Dialog';
import { Heart } from 'lucide-react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="About CardShark"
      buttons={[
        {
          label: 'Close',
          onClick: onClose,
          variant: 'primary'
        }
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-lg">
          <span>Created with</span>
          <Heart className="h-5 w-5 text-red-500" fill="currentColor" />
          <span>by VirtualAlias</span>
        </div>

        <section className="space-y-2">
          <h3 className="font-medium">Project</h3>
          <p className="text-gray-300">
            A Character Card Metadata Editor for easily managing character cards
            for use with open source LLM frontends like Silly Tavern and Backyard.ai.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Special Thanks</h3>
          <div className="text-gray-300 space-y-1">
            <ul className="list-disc pl-5 space-y-1">
              <li>My lead developer, Claude</li>
              <li>Silly Tavern</li>
              <li>The KoboldCPP Team</li>
              <li>Backyard.ai</li>
            </ul>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Friends & Contributors</h3>
          <ul className="text-gray-300 list-disc pl-5 space-y-1">
            <li>The entire Garage community, for their support, ambition, kindness, and friendship.</li>
            <li>Rabbit for being my Discord Daddy</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="font-medium">Technology</h3>
          <ul className="text-gray-300 list-disc pl-5 space-y-1">
            <li>Python</li>
            <li>React</li>
            <li>Tailwind</li>
          </ul>
        </section>

        <footer className="pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>Version 0.2</span>
            <span>© 2024 CardShark Team</span>
          </div>
        </footer>
      </div>
    </Dialog>
  );
}