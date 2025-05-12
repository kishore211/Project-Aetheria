// No React import needed in modern React with JSX transform
import { useGameStore } from '../../store/gameStore';
import type { Entity, Resource } from '../../types/world';

const InfoPanel = () => {
  const { selectedTile, selectedEntity, showDebugInfo, setSelectedEntity } = useGameStore();
  
  // No information to display if no tile or entity is selected
  if (!selectedTile && !selectedEntity) return null;
  
  return (
    <div className="fixed right-4 top-4 bg-secondary w-72 p-4 rounded-md shadow-lg">
      {selectedEntity ? (
        // Entity information
        <div>
          <h3 className="text-foreground font-medium text-lg mb-2">Entity: {selectedEntity.name}</h3>
          
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>{' '}
              <span className="text-foreground capitalize">
                {selectedEntity.type.replace('_', ' ')}
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground">Health:</span>{' '}
              <span className="text-foreground">
                {Math.round(selectedEntity.health)}/{Math.round(selectedEntity.maxHealth)} 
                ({Math.round((selectedEntity.health / selectedEntity.maxHealth) * 100)}%)
              </span>
              <div className="w-full mt-1 bg-background rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full" style={{ width: `${(selectedEntity.health / selectedEntity.maxHealth) * 100}%` }} />
              </div>
            </div>
            
            <div>
              <span className="text-muted-foreground">Age:</span>{' '}
              <span className="text-foreground">
                {Math.round(selectedEntity.age)}/{Math.round(selectedEntity.maxAge)} years 
                ({Math.round((selectedEntity.age / selectedEntity.maxAge) * 100)}%)
              </span>
            </div>
            
            <div>
              <h4 className="text-muted-foreground font-medium mb-1">Attributes:</h4>
              <ul className="grid grid-cols-2 gap-1">
                <li className="text-foreground">
                  <span className="text-muted-foreground">Strength:</span>{' '}
                  {selectedEntity.attributes.strength}
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Speed:</span>{' '}
                  {selectedEntity.attributes.speed}
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Intelligence:</span>{' '}
                  {selectedEntity.attributes.intelligence}
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Resilience:</span>{' '}
                  {selectedEntity.attributes.resilience}
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-muted-foreground font-medium mb-1">Needs:</h4>
              <ul className="grid grid-cols-2 gap-1">
                <li className="text-foreground">
                  <span className="text-muted-foreground">Hunger:</span>{' '}
                  <div className="w-full mt-1 bg-background rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${selectedEntity.needs.hunger * 100}%` }} />
                  </div>
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Thirst:</span>{' '}
                  <div className="w-full mt-1 bg-background rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${selectedEntity.needs.thirst * 100}%` }} />
                  </div>
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Rest:</span>{' '}
                  <div className="w-full mt-1 bg-background rounded-full h-1.5">
                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${selectedEntity.needs.rest * 100}%` }} />
                  </div>
                </li>
                <li className="text-foreground">
                  <span className="text-muted-foreground">Social:</span>{' '}
                  <div className="w-full mt-1 bg-background rounded-full h-1.5">
                    <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${selectedEntity.needs.social * 100}%` }} />
                  </div>
                </li>
              </ul>
            </div>
            
            {selectedEntity.status && selectedEntity.status.length > 0 && (
              <div>
                <h4 className="text-muted-foreground font-medium mb-1">Status:</h4>
                <ul className="text-foreground flex flex-wrap gap-1">
                  {selectedEntity.status.map((status: string) => (
                    <li key={`status-${status}`} className="capitalize bg-primary/20 px-2 py-0.5 rounded-full text-xs">
                      {status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {selectedEntity.inventory && selectedEntity.inventory.length > 0 && (
              <div>
                <h4 className="text-muted-foreground font-medium mb-1">Inventory:</h4>
                <ul className="list-disc list-inside">
                  {selectedEntity.inventory.map((item: Resource) => (
                    <li key={`inventory-${item.type}`} className="text-foreground capitalize">
                      {item.type} ({item.quantity})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : selectedTile ? (
        // Tile information
        <div>
          <h3 className="text-foreground font-medium text-lg mb-2">Tile Info</h3>
          
          <div className="space-y-2 text-sm">
            {/* Basic tile information */}
            <div>
              <span className="text-muted-foreground">Position:</span>{' '}
              <span className="text-foreground">
                X: {selectedTile.x}, Y: {selectedTile.y}
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground">Biome:</span>{' '}
              <span className="text-foreground capitalize">
                {selectedTile.type.replace('_', ' ')}
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground">Elevation:</span>{' '}
              <span className="text-foreground">
                {Math.round(selectedTile.height * 100)}%
              </span>
            </div>
            
            {/* Resources */}
            <div>
              <h4 className="text-muted-foreground font-medium mb-1">Resources:</h4>
              {selectedTile.resources.length > 0 ? (
                <ul className="list-disc list-inside">
                  {selectedTile.resources.map((resource: Resource) => (
                    <li key={`resource-${resource.type}`} className="text-foreground capitalize">
                      {resource.type} ({resource.quantity})
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-foreground italic">None</span>
              )}
            </div>
            
            {/* Entities */}
            <div>
              <h4 className="text-muted-foreground font-medium mb-1">Entities:</h4>
              {selectedTile.entities.length > 0 ? (
                <ul className="list-disc list-inside">
                  {selectedTile.entities.map((entity: Entity) => (
                    <li key={entity.id} className="text-foreground capitalize">
                      <button 
                        type="button"
                        className="hover:underline"
                        onClick={() => setSelectedEntity(entity)}
                      >
                        {entity.name} ({entity.type})
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-foreground italic">None</span>
              )}
            </div>
            
            {/* Structure */}
            {selectedTile.structure && (
              <div>
                <h4 className="text-muted-foreground font-medium mb-1">Structure:</h4>
                <div className="text-foreground capitalize">
                  {selectedTile.structure.type.replace('_', ' ')}
                  {selectedTile.structure.level && ` (Level ${selectedTile.structure.level})`}
                </div>
              </div>
            )}
            
            {/* Climate */}
            <div>
              <h4 className="text-muted-foreground font-medium mb-1">Climate:</h4>
              <div className="grid grid-cols-2 gap-x-2">
                <div>
                  <span className="text-muted-foreground">Moisture:</span>{' '}
                  <span className="text-foreground">{Math.round(selectedTile.moisture * 100)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Temperature:</span>{' '}
                  <span className="text-foreground">{Math.round(selectedTile.temperature * 100)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Fertility:</span>{' '}
                  <span className="text-foreground">{Math.round(selectedTile.fertility * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
          
          {showDebugInfo && (
            <div className="mt-4 pt-2 border-t border-secondary-foreground/20">
              <h3 className="text-foreground font-medium text-sm mb-1">Debug Info</h3>
              <div className="text-xs text-muted-foreground">
                <div>Raw Height: {selectedTile.height.toFixed(3)}</div>
                <div>Scaled Height: {selectedTile.scaledHeight.toFixed(3)}</div>
                <div>Walkable: {selectedTile.walkable === false ? 'No' : 'Yes'}</div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default InfoPanel;
