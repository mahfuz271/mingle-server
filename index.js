const express = require('express')
const dotenv = require('dotenv')
var cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json());
dotenv.config()

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' });
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DBV_USER}:${process.env.DB_PASSWORD}@cluster0.yzlpmea.mongodb.net/?retryWrites=true&w=majority`;

async function run() {
    try {
        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
        const userCollection = client.db('mingle').collection('users');
        const followCollection = client.db('mingle').collection('follower');
        const postsCollection = client.db('mingle').collection('posts');


        app.post('/post', verifyJWT, async (req, res) => {
            const post = req.body;
            post.likes = [];
            post.comments = {};
            post.created = new Date(Date.now());

            const decoded = req.decoded;

            if (decoded.email !== post.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }
            let result = await postsCollection.insertOne(post);
            return res.send(result)
        });

        app.get('/postsByEmail', verifyJWT, async (req, res) => {
            let query = {
                email: req.query.email
            }
            const decoded = req.decoded;
            const posts = await postsCollection.aggregate([
                {
                    $project: {
                        email: 1,
                        privacy: 1,
                        text: 1,
                        img: 1,
                        created: 1,
                        like_by: {
                            $in: [decoded.email, "$likes"]
                        },
                        like_count: { $size: "$likes" }
                    }

                }, {
                    $match: query
                }
            ])?.toArray();
            res.send(posts);
        });

        app.post('/postreact', verifyJWT, async (req, res) => {
            const query = { _id: ObjectId(req.query.id) };
            const email = req.decoded.email;
            const result = await postsCollection.aggregate([
                {
                    $project: {
                        likes: 1
                    }
                }, {
                    $match: query
                }, { $limit: 1 }
            ]).toArray();

            if (result && result[0]) {
                let likes = result[0].likes ? result[0].likes : [];
                likes = likes.filter(item => item !== email);
                if (req.query.task == 'added') {
                    likes.push(email);
                }
                const updatedDoc = { $set: { likes } };
                let result2 = await postsCollection.updateOne(query, updatedDoc);
            }
            res.send({})

        });

        app.post('/jwtANDusers', async (req, res) => {
            const u = req.body;

            const query = { email: u.email };
            let user = await userCollection.findOne(query);
            if (!user && u?.insert) {
                delete u.insert;
                let status = await userCollection.insertOne(u);
                user = await userCollection.findOne(query);
            }
            if (user) {
                let token = jwt.sign({ email: u.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
                let role = user.role;
                return res.send({ token, role });
            }
            res.send({})

        });

        app.post('/follow_unfollow', async (req, res) => {
            const u = req.body; let result;
            if (req.query.task == 'follow') {
                result = await followCollection.findOne(u);
                if (!result) {
                    u.created = new Date(Date.now());
                    result = await followCollection.insertOne(u);
                }
            } else {
                result = await followCollection.deleteOne(u);
            }
            res.send(result)

        });

        app.post('/updateProfile', verifyJWT, async (req, res) => {
            const s = req.body;
            const decoded = req.decoded;

            if (decoded.email !== req.query.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }

            const query = { _id: ObjectId(s._id) }
            delete s._id;
            const updatedDoc = {
                $set: s
            }
            let result = await userCollection.updateOne(query, updatedDoc);

            res.send(result);
        });

        app.post('/getRole', verifyJWT, async (req, res) => {
            const decoded = req.decoded;
            let query = {
                email: decoded.email
            }
            const c = await userCollection.findOne(query)
            res.send({ role: c.role });
        });

        app.post('/getProfile', verifyJWT, async (req, res) => {
            let query = {
                email: req.query.email
            }
            const decoded = req.decoded;
            const user = await userCollection.findOne(query)
            if (user) {
                let query2 = {
                    follow: req.query.email,
                    email: decoded.email
                }
                user.already_follower = await followCollection.count(query2);

                let follow = await followCollection.aggregate([{
                    $lookup: {
                        from: 'users',
                        localField: "email",
                        foreignField: "email",
                        as: 'details'
                    }
                }, {
                    $match: { follow: req.query.email }
                }]);
                user.total_follower = await follow.toArray();

            }
            res.send(user);
        });

        app.delete('/users/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        app.get('/users', verifyJWT, async (req, res) => {
            let query = {};
            if (req.query.role) {
                query = {
                    role: req.query.role
                }
            }
            const cursor = userCollection.find(query)
            const c = await cursor.toArray();
            res.send(c);
        });
    }
    finally {

    }

}

app.get('/', (req, res) => {
    res.send('Server created for mingle by Mahfuz.')
})

run().catch(err => console.error(err));

app.listen(port, () => {
    console.log(`Mingle server app listening on port ${port}`)
})