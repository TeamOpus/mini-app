import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URL!;

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

client = new MongoClient(uri);
clientPromise = client.connect();

export default clientPromise;