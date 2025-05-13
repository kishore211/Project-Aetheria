// This is just a simple test file to verify that the renamed functions work
import { createEntity } from '../utils/entitySystem';

// Test original createEntity
console.log('Testing createEntity function');
const testEntity = createEntity('human', 10, 10);
console.log(`Created entity of type ${testEntity.type} with ID ${testEntity.id}`);

// Export is needed so TypeScript treats this as a module
export {};
