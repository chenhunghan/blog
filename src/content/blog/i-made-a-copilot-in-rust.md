---
title: 'I made a Copilot in Rust 🦀'
description: 'Building a minimalist Copilot server in Rust with candle: ownership, async, and design patterns, from a TypeScript developer.'
pubDate: '2023-12-17'
tags: [rust, typescript, ai, llm]
thumbnail: '../../assets/i-made-a-copilot-in-rust/thumbnail.png'
---

My article [Code Llama as Drop-In Replacement for Copilot Code Completion](/blog/code-llama-as-copilot-replacement/) receiving lots of positive feedbacks. Since then, I made few other attempt to improve the copilot server.

In terms of performance, I made a PR in [exllamav2](https://github.com/turboderp/exllamav2/pull/23) on a copilot server, using exllama2's super fast CUDA custom kernel.

To improve the completion quality, I tried few other LLMs such as [replit-code-v1_5-3b](https://huggingface.co/replit/replit-code-v1_5-3b), [long_llama_code_7b](https://huggingface.co/syzymon/long_llama_code_7b), [CodeShell-7B](https://huggingface.co/WisdomShell/CodeShell-7B) and [stablelm-3b-4e1t](https://huggingface.co/stabilityai/stablelm-3b-4e1t).

 As a practicing developer + a [GPU poor](https://www.businessinsider.com/gpu-rich-vs-gpu-poor-tech-companies-in-each-group-2023-8?r=US&IR=T) without access to H100 clusters, to contribute in the era of _AI Wild West_, I'm more interesting to improve the ergonomics of the copilot server.

Hugging Face's [candle](https://github.com/huggingface/candle), a _minimalist ML framework_ for Rust, looks super interesting. So I started to create a minimalist copilot server in Rust 🦀.

> Before you continue, note that [exllamav2](https://github.com/turboderp/exllamav2/pull/23) version, python + CUDA is still much faster then the Rust version. This article is mostly for those interested in learning Rust, and want to learn the programming by building a fun project.

Essentially, this's a **Build Your Own Copilot** (in Rust 🦀) tutorial, the code is intended to be educational. If you just want to try the final product [oxpilot](https://github.com/chenhunghan/oxpilot):

```shell
brew install chenhunghan/homebrew-formulae/oxpilot
```

and starts the copilot server

```
ox serve
```

or chat with the LLM
```
ox hi in Japanese
```

We will be using [axum](https://github.com/tokio-rs/axum) as the web framework, [candle](https://github.com/huggingface/candle) for text inferencing,   [clap](https://github.com/clap-rs/clap) for cli arguments parsing and [tokio](https://github.com/tokio-rs/tokio) as the asynchronous runtime.

(Some sections are still WIP)

If you are already familiar with Rust at some levels, for example feeling comfortable with Rust's `ownership`/`borrowing` but not the [async](#async) world, I suggest to jump to [Async](#async) section.

If you are already familiar with [async](#async) Rust, you can go directly to [Hands-on](#hands-on) which introduces some design patterns you might find useful, or just go to the Github [oxpilot](https://github.com/chenhunghan/oxpilot) project where everything is open-sourced.

Please expect some, ~~if not many~~, human errors. I documented my learning process hoping that can help someone on the internet, which likes to build a exciting project when learning a new language.

Thanks [jihchi](https://github.com/jihchi) for reviewing the draft of this article.

## Books and References <a id="books"></a>

This article is self-contained, which means it should have all you need to know to read the source code in [oxpilot](https://github.com/chenhunghan/oxpilot).

However it's not possible to cover everything in each section. I try to provide references at the end of each sections, highly recommend to read the [The Rust Programming Language](https://doc.rust-lang.org/book/) if you haven't. 

## Tracing is batteries-included `console.log` <a id="consolelog"></a>

`console.log` is a powerful tool in TypeScript, you can print whatever you want, thus `console.log` is super useful for debugging. The Rust equivalent is `print!`, [Rust by Example](https://doc.rust-lang.org/rust-by-example/hello/print.html) is an excellent document if you want get started quickly to use `print!`.

However, `print!` blocks stdio, and it's better to [lock stdio and unlock manually](https://nnethercote.github.io/perf-book/io.html), which is tedious. 

Luckily we have alternative, [Tracing](https://github.com/tokio-rs/tracing) is an awesome project by [tokio](https://github.com/tokio-rs/tokio) team, as a TypeScript developer, I feel like home using tracing.
```rust
info!("Hello! Rust!");
info!("Print var: {:?}", var);
```

### What is `{:?}` ? <a id="consolelog-debug"></a>

You might wonder what is `{:?}` in the code block.
```rust
info!("Print var: {:?}", var);
```

`{:?}` is for printing [struct](https://doc.rust-lang.org/std/keyword.struct.html) (like Object in TypeScript). Alternatively `{:#?}` can pretty print (), [see more](https://doc.rust-lang.org/rust-by-example/hello/print/print_debug.html), think of it like `console.log(JSON.stringify(object,null,2))`.

### Measure performance <a id="consolelog-performance"></a>

[Tracing](https://github.com/tokio-rs/tracing) is an awesome for logging performance metrics, for example, if I want to measure how long `awesome()` took.
```rust
async fn awesome() {}
awesome().instrument(tracing::info_span!("awesome")).await;
```
Prints super usefully messages, which tells when we start invoking `awesome()`, at which line, and which thread it was on, and how long it took to execute the function.
```shell
2023-10-22T09:01:13.128553Z INFO ThreadId(01) awesome src/main.rs:172: enter
2023-10-22T09:01:13.128569Z INFO ThreadId(01) awesome src/main.rs:172: close time.busy=15.3µs time.idle=3.96µs
```

## Feeling Safe <a id="safe"></a>

Rust is **_safe_** by default, the _safe_ often refers to memory-safety. However, from my experience, Rust makes you feel safe shipping to production...once the code compiles.

If you ever wrote a line of code in JavaScript, and then switch to TypeScript, you probably knows what I mean by "feeling safe".

TypeScript protects us from `TypeError: Cannot read property '' of undefined` at compile time, Rust is like TypeScript with **_ultra_** `strict` mode on which protect us, developers from making mistakes **at compile time**.

Rust makes pull requests easier to review and increase the confident of shipping to production, the compiler error messages might seen overwhelming, just like TypeScript errors at the beginning.

However , if you ever under the stress of recovering production servers, you will know that learning to resolve the compile time error is better then resolving runtime exceptions.

To embrace the Rust _safety net_, immutability and ownership are two key concepts to understand.

### Variables are immutable by default <a id="immutable-var"></a>

"Immutable by default" means once data created, they can't not be mutated, most will agree that immutable data makes [your code better](https://medium.com/dailyjs/use-const-and-make-your-javascript-code-better-aac4f3786ca1).

For example, a seasoned TypeScript developer probably knows the benefits of using `const`, `const` makes the code intend explicit when you try to mutate the value.

```ts
const x = 5;
x = 1; // Cannot assign to 'x' because it is a constant.
```

In Rust, variables are immutable by default and only mutable if you explicitly declare as mutable.

```rust
fn main() {
    let x = 5; // this does not compile, 
    x = 6; // explicit `let mut x` to make mutation possible.
}
```

The book's [Variables and Mutability](https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html) has comprehensive explanation on mutability in Rust.

### You should not **_move_**! Ownership <a id="ownership"></a>

From a language with a garbage collector, the following code looks natural, we try to create `string2` by referencing `string1`:

```rust
fn main() {
  let s1 = String::from("hello");
  let s2 = s1;
  println!("{}", s1);
}
```

However, the code does not compile, the compiler said you have **moved** `s1`.
```shell
11 |   let s1 = String::from("hello");
   |       -- move occurs because `s1` has type `String`, which does not implement the `Copy` trait
12 |   let s2 = s1;
   |            -- value moved here
13 |   println!("{}", s1);
   |                  ^^ value borrowed here after move
```

This might be the first, and continuously frustrating compiler error message when starting Rust.

![You should not pass!](../../assets/i-made-a-copilot-in-rust/you-shall-not-pass.jpg)

Rust does not ship with a garbage collector, which means it does not know (at runtime) when to drop the value from memory when you don't need the value anymore.

To archive this goal, Rust introduce the ownership checker, to make the developer **mark** the value when the rest of the code doesn't need it. Ownership checker helps you to manage memory **at compile time**, so we don't need to ship the code with a garbage collector that collect, and drop unused values from the memory in the runtime.

`value **moved** here` in the above example code is telling that the code is violating the ownership rules, which are

> 1. Each value in Rust has an owner.
> 2. There can only be one owner at a time.
> 3. When the owner goes out of scope, the value will be dropped.

The compiler is telling: Hey! `s1` is the owner of `String::from("hello")`, however, you have **_moved_** the ownership from `s1` to `s2`, since you don't need the `s1`, compiler dropped `s1`, therefore, you should not use it again 
 in `println!`!

```rust
fn main() {
  let s1 = String::from("hello");
  let s2 = s1; // ownership moved from s1 to s2
  println!("{}{}", s1); // s1 is dropped, why you are still using it?
}
```

If you are from TypeScript world (or any language with a garbage collector), ownership might looks foreign, however, learning ownership checker makes you aware of memory allocation.

#### Ownership and Scope <a id="scope"></a>

Let's review the ownership rules again, and get deeper into the third rule.

> 1. Each value in Rust has an owner.
> 2. There can only be one owner at a time.
> 3. When the owner goes out of scope (the curly brackets `{}`), the value will be dropped.
 
In the following example, the compiler stops us at the second `do_something()` call, because we violate the ownership rule by moving `owner` into `do_something` and try to use `owner` again.

This does not compile:
```rust
fn main() {
    let owner = String::from("value");
    // we took the ownership of "value" from `owner` and
    // "value" is dropped at the end of the `do_something` function
    // thus the variable `owner` does not own it anymore
    do_something(owner);
    // use of moved value: `owner` value used here after move
    print!("{}", owner);
}

fn do_something(_: String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=855280d7cee41053de575a3af7697934)

`print!("{}", owner)` violates the ownership rule because we have already move the `owner` into `do_something(owner)`'s 
 scope, therefore, after the the `do_something(owner)` execution is finished, the `owner` is **_out of scope_**, the `owner` is dropped and we can't use it anymore.

#### Borrow <a id="borrow"></a>

To get around ownership rules, borrowing to rescue.

Borrowing is using reference syntax (`&`) to make Rust compiler knows we are just borrowing instead of taking ownership, borrowing using reference to make a promise that we are justing temporarily borrowing the value, we do not intend to take the ownership, and return the value when don't need it anymore.

Compiled
```rust
fn main() {
    let owner = String::from("value");
    // `do_something` borrows `"value"` from `owner`
    do_something(&owner);
    // No more error!
    print!("{}", owner);
}

fn do_something(_: &String) {
    // "value" is NOT dropped at the end of the function
    // because we are just borrowing (`&String`) not taking the ownership
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=eeca5897ae7a8fd8fbee836218eceaf8)

Just like the ownership, the borrowing has a set of rules, these rules are the like contracts you made when you borrow something from someone else.

Areal world example for analogue: you want to borrow a book ["Rust for Rustaceans"](https://rust-for-rustaceans.com/) from a friend, to keep the friendship, you made a contract  (a verbal promise: "I will return the borrowed book back to you in one month"), the contract needs to follow the borrowing rules:

> 1. At any given time, you can have as many immutable reference you want but only one mutable reference.  
> 2. Reference must be referencing to a value that is valid (disallow referencing to a dropped value).

It's ok if ownership and borrowing still seems blur, the book's [understanding ownership](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html) chapter is the best read, and you will get familiar with ownership rules soon after passing data and compiler yelling at you from time to time.

If you are a busy developer, Let's Get Rusty's [The Rust Survival Guide](https://www.youtube.com/watch?v=usJDUSrcwqI) is a great way to crash into ownership rules quickly.

## Asynchronous <a id="async"></a>

Before we start this section, let's pin the definitions of terminology.

### Terminology 

Async is a feature in a programming language intended to provide opportunities for the program to execute a unit of computation while waiting another unit of computation to complete.

#### Parallelism <a id="parallelism"></a>

The program executes units of computation at the same time, simultaneously, for example running two computations in two different cores of CPU.

#### Concurrency <a id="concurrency"></a>

The program process units of computation, executes them one by one, and yield from a unit to another unit quickly when a unit makes progress, the program yields between units quickly, as if the program executes units at the same time (but it's **not** simultaneously) [ref](https://youtu.be/Z-2siR9Ki84?si=L6MZCUQZmRA5hLcg&t=357), for the single-threaded Node.js runtime.

#### Task (Green Thread) <a id="task"></a>

A task is for some computation running in a _parallel_ or _concurrent_ system. In this article, the term **task** refer to [asynchronous green thread](https://docs.rs/tokio/latest/tokio/task/index.html) that is not a OS thread but a unit of execution managed by the [async runtime](#runtime).

### Runtime (the Task Runner) <a id="runtime"></a>

Node.js is single-threaded, asynchronous runtime, the program can process [tasks](#task) asynchronously, however, the program is not processing the tasks in parallel, because Node.js is single-threaded.

To process tasks asynchronously in Rust, the developer needs to setup a task runner. The `main` function (think of it like `index.ts`), which is the entry point of a Rust program, is always synchronous, the developer needs to setup the runtime to be able to run asynchronous tasks in Rust.

The following code uses [futures::executor](https://docs.rs/futures/latest/futures/executor/index.html) as the async task runner.

```rust
fn main() {
    // the async task runner.
    futures::executor::block_on(do_something());
}

// An async task
async fn do_something() {
    //
}
```

In Rust, you are free to choose any async runtimes, like in TypeScript, we have `node.js`, `bun` and `deno`. In Rust we have [tokio](https://github.com/tokio-rs/tokio), [async-std](https://async.rs/), [smol](https://github.com/smol-rs/smol) and [futures](https://docs.rs/futures/latest/futures/), these runtime can be single threaded, like `node.js` which runs tasks [concurrently](#concurrency), or multiple threaded that is **true** [parallelism](#parallelism).

You may find these video useful to understand the `async/await` in Rust.
  - [1 Hour Dive into Asynchronous Rust](https://www.youtube.com/watch?v=0HwrZp9CBD4)
  - [Async/await in Rust: Introduction](https://www.youtube.com/watch?v=FNcXf-4CLH0)

### Ownership and Async <a id="async_ownership"></a>

In [You should not **_move_**! Ownership](#ownership) we discuss the ownership rules, and in [Borrow](#borrow) section, we discuss how to get over ownership rules by borrowing.

In async Rust, no matter you are using a single-threaded [concurrent](#concurrency) green thread runtime, or distributing computation to multiple OS threads ([parallelism](#parallelism)), the ownership rules always apply. In the async Rust, the ownership rules are preventing data race in concurrent programming or parallel programming in Rust. (Also known as [fearless concurrency](https://doc.rust-lang.org/book/ch16-00-concurrency.html#fearless-concurrency))

Remember the ownership rules?

> 1. Each value in Rust has an owner.
> 2. There can only be one owner **at a time**.
> 3. When the owner goes out of scope the value will be dropped.

Pay special attention of **at a time**, it is how ownership help us avoiding data race when running computation at the same time (= [asynchronous](#async)). 

Let's look at the synchronous version again, in previous example this failed to compile...
```rust
fn main() {
    let owner = String::from("value");
    do_something(owner);
    // use of moved value: `owner` value used here after move
    print!("{}", owner);
}

fn do_something(_: String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=24619e92b8118da6d9900c423ad0f957)
...because the code does not follow the ownership rules, that is, both `do_something()` took ownership of `String::from("hello")`, but Rust compiler only allows one ownership **at a time**. To protect us from forgetting deallocating memory, the `owner` is **_moved_** into the fist `do_something(owner)`, and we can't compile the code because this error `use of moved value: `owner` value used here after`.

```shell
3 |     do_something(owner);
  |                  ----- value moved here
4 |     // use of moved value: `owner` value used here after move
5 |     print!("{}", owner);
  |                  ^^^^^ value borrowed here after move
```

We can get over this by [borrowing](#borrow)(`&`)
```rust
fn main() {
    let owner = String::from("value");
    // use & to reference owner
    do_something(&owner);
    // We can still use owner after
    print!("{}", owner);
}

fn do_something(_: &String) {
    // 
}

```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=323a44e074de5572fd74fb80249c3c9d)

The same ownership rules apply to [asynchronous](#async) Rust, let's look at [parallelism](#parallelism) version, which `spawns` OS threads running code **simultaneously**:

```rust
use std::thread;

fn main() {
    let owner = String::from("value");
    thread::spawn(|| {
        do_something(&owner);
    });
}
fn do_something(_: &String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=28553de752bf5e85d5ed32d5abf4cc10)

We knew that we need to use [borrowing](#borrow)(`&`) to avoid taking ownership when calling `do_something(&owner)`. However, the compiler still reject, it says:

> closure may outlive the current function, but it borrows `owner`, which is owned by the current function

This very compiler error is telling that the borrowing of `owner` might be referenced to a value, outside of the thread closure, **at a time**, when the value is dropped, violating this rule we discussed in [borrowing](#borrow).

> 2. Reference must be referencing to a value that is valid (disallow referencing to a dropped value).

To give this **_outlive_** error more context, try to run this code in the [playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=7be27d273fbee33b82c642fbfd214055).
```rust
use std::thread;

fn main() {
    thread::spawn(|| {
        print!("from thread");
    });
    print!("from main");
}
```

You might be surprised that there is only `from main` in the console. It's because Rust's thread implementation in the `std` allows the created threads to outlive the thread created them, in other words, the parent thread (in our case the `main()`) created the child thread, the child thread created via `thread::spawn` might outlived the parent (the `main()`).

That's the reason why you see `from main` in the console, execution of `|| print!("from thread")` outlived the execution of `main`.

If we step back, and think at a higher degree of borrowing in threads:
```
use std::thread;

fn main() {
    let owner = String::from("value");
    thread::spawn(|| {
        // we borrow owner, but the borrowed value (`owner`)
        // might be dropped in main(), that is the `&` might point
        // to a dropped value
        do_something(&owner);
    });
}
fn do_something(_: &String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=d545cc80534ff175b793a9df34dcd941)

We are running code **simultaneously** from `main` and a thread, **at the same time**, the compiler stops us by telling us that the "closure (in the thread) may outlive the current function but it borrows `owner`, which is owned by the `main()`, we shouldn't do this because we might be referenced to `owner` when it is invalid in the parent thread (`main()`).

The same **_outlive_** problem can be observed in [concurrent](#concurrency) code, even if in most [concurrent](#concurrency) runtimes, code execution is not in OS threads but in [tasks](#task):

```rust
/*
[dependencies]
tokio = { version = "1.32.0", features = ["full"] }
*/

#[tokio::main]
async fn main() {
    let owner = String::from("value");
    
    tokio::spawn(do_something(&owner));
}

async fn do_something(_: &String) {
    //
}
```
[rustexplorer](https://www.rustexplorer.com/b#LyoKW2RlcGVuZGVuY2llc10KdG9raW8gPSB7IHZlcnNpb24gPSAiMS4zMi4wIiwgZmVhdHVyZXMgPSBbImZ1bGwiXSB9CiovCgojW3Rva2lvOjptYWluXQphc3luYyBmbiBtYWluKCkgewogICAgbGV0IG93bmVyID0gU3RyaW5nOjpmcm9tKCJ2YWx1ZSIpOwogICAgCiAgICB0b2tpbzo6c3Bhd24oZG9fc29tZXRoaW5nKCZvd25lcikpOwp9Cgphc3luYyBmbiBkb19zb21ldGhpbmcoXzogJlN0cmluZykgewogICAgLy8KfQ==)

This code block failed with similar error message `"owner" does not live long enough`. 

To get over this [Threads Don't Borrow](https://stevedonovan.github.io/rust-gentle-intro/7-shared-and-networking.html#threads-dont-borrow) error, that is, to get over the ownership rule that disallow referencing a value from parent to children threads/tasks. We have few solutions:

1. `move` the value into the thread ([read more](https://doc.rust-lang.org/book/ch16-01-threads.html#using-move-closures-with-threads))
```rust
use std::thread;

fn main() {
    let owner = String::from("value");
    // `move` moving the `owner` into the spawned thread
    thread::spawn(move || {
        do_something(&owner);
    });
}
fn do_something(_: &String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=ff8990b967ff3d589c248f04a0d2b0d3)
2. Use [`scoped` thread](https://doc.rust-lang.org/beta/std/thread/fn.scope.html), which exits before the parent thread (`main`) exits.
```rust
use std::thread;

fn main() {
    let owner = String::from("value");
    // scoped thread alway exists before the main thread exists
    // therefore we can use reference to pointing to `owner`
    thread::scope(|_| {
        do_something(&owner);
    });
}
fn do_something(_: &String) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=cc57c70bd170def86338d77eee8bda83)
3. "Do not communicate by sharing memory; instead, share memory by communicating" as in the [Go language documentation](https://go.dev/doc/effective_go#concurrency). We will dive into this in the [actor](#actor) section.
4. Atomic Reference Counting ([`Arc<T>`](https://doc.rust-lang.org/std/sync/struct.Arc.html)) and Mutual Exclusion ([`Mutex<T>`](https://doc.rust-lang.org/std/sync/struct.Mutex.html)).

We will dive in to the ([`Arc<T>`](https://doc.rust-lang.org/std/sync/struct.Arc.html)) in the next section.

### Share States in Async Program: Arc and Mutex <a id="arc_mutex"></a>

Sharing a state in an async program can be a challenge. [Ownership rules](#ownership) only allow a value to have a owner at a time. We can't use [borrowing](#borrow) because the compiler does not know will the borrower in the thread/task pointing to a dropped value **_at a time_**.

To solve this problem, we can use `Arc` ([Atomic Reference Counting](https://doc.rust-lang.org/std/sync/struct.Arc.html)). 

`Arc` is _safe_ to use to share the state across multiple threads/tasks. To wrap a data into `Arc` to have multiple copies of the same data:

```rust
use std::thread;
use std::sync::Arc;

fn main() {
    let arc = Arc::new(String::from("value"));
    thread::spawn(|| {
        do_something(arc);
    });
}
fn do_something(_: Arc<String>) {
    // 
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=5d4b3d2af20a1152f4fcd56477fb04b4)

`Arc` allows **_safe_** read to the inner data across threads, it's similar to [borrowing](#borrow) but for [asynchronous](#async) code blocks.

However, `Arc` only allows read, to enable thread to write to the inner data. The data needs to be handled with proper locking mechanism, that is the ([`Mutex<T>`](https://doc.rust-lang.org/std/sync/struct.Mutex.html)).

[`Mutex<T>`](https://doc.rust-lang.org/std/sync/struct.Mutex.html) (reads: mutual exclusion) will block threads waiting for the lock to become available. When calling `lock()` on a thread, the thread will become the only thread that can access the data, `Mutex<T>` blocks other threads from access the data, therefore, it's safe to mutate the data while the lock has not been unlocked.

To safely mutate the data we share with state:
```rust
use std::thread;
use std::sync::{Arc, Mutex};

fn main() {
    let inner_data = String::from("Hello ");
    let mutex = Arc::new(Mutex::new(inner_data));
    let mutex_clone = mutex.clone();
    thread::spawn(move || {
        let mut inner_data = mutex.lock().unwrap();
        inner_data.push_str(" world (once)!")
    });
    thread::spawn(move || {
        let mut inner_data = mutex_clone.lock().unwrap();
        inner_data.push_str(" world (twice)!")
    });
}
```
[playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=e6c1a5be6c381f2895c7733d4a8aa102)

We will dive deeper on how to use `Arc<Mutex<_>>` to share the mutable state in section [Share Memory `Arc<Mutex<_>>`](#arc_mutex_share).

To learn more on sharing state:
- The book's [Shared-State Concurrency
](https://doc.rust-lang.org/book/ch16-03-shared-state.html) chapter.
- Tokio's documentation has a dedicated page on how to [share state between async tasks](https://tokio.rs/tokio/tutorial/shared-state). 

## Hands-On <a id="hands-on"></a>

In the following sections, we will start building the copilot server.

### Server-Sent Events (SSE) Server <a id="sse"></a>

In this PR, we add the endpoint for the copilot client

From [Code Llama as Drop-In Replacement for Copilot Code Completion](/blog/code-llama-as-copilot-replacement/) we knew that a copilot server is essentially a HTTP server that accepts a request with a prompt and return `JSON` chucks in [Server-Sent Events (SSE)](https://en.wikipedia.org/wiki/Server-sent_events). Let's try to specify the SSE endpoint and creating an Server-Sent Events (SSE) Server using [axum](https://github.com/tokio-rs/axum).

- The URL path of the endpoint. `/v1/engines/:engine/completions`
- The endpoint should accept a `POST` request.
- The endpoint takes a path parameter (`:engine`) and a request body.
- The endpoint return a SSE stream of text chucks (`Content-Type: text/event-stream`). 

Since this endpoint is almost identical to [OpenAI's completions](https://platform.openai.com/docs/guides/text-generation/completions-api) endpoint, we can use `curl` to see the input's input (request body) and the output (SSE text chucks)

```sh
curl https://api.openai.com/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo-instruct",
    "prompt": "Say this is a test",
    "max_tokens": 7,
    "temperature": 0,
    "stream": true
  }'
# chuck 0
data: {"choices":[{"text":"This ","index":0,"logprobs":null,"finish_reason":null}],
"model":"gpt-3.5-turbo-instruct", "id":"...","object":"text_completion","created":1}
# chuck 1
data: {"choices":[{"text":"is ","index":0,"logprobs":null,"finish_reason":null}],
"model":"gpt-3.5-turbo-instruct", "id":"...","object":"text_completion","created":1}
# chuck 2
data: {"choices":[{"text":"a ","index":0,"logprobs":null,"finish_reason":null}],
"model":"gpt-3.5-turbo-instruct", "id":"...","object":"text_completion","created":1}
# chuck with `"finish_reason":"stop"`
data: {"choices":[{"text":"test.","index":0,"logprobs":null,"finish_reason":"stop"}],
"model":"gpt-3.5-turbo-instruct", "id":"...","object":"text_completion","created":1}
# end of SSE event stream
data: [DONE]
```

#### BDD (Behaviour-Driven Development) the Endpoint <a id="bdd"></a>

We will use [`reqwest_eventsource`](https://docs.rs/reqwest-eventsource/latest/reqwest_eventsource/) and its friends in the test to act as the client, which send request to our endpoint `/v1/engines/:engine/completions` and assert the response is what we expected. Since [`reqwest_eventsource`](https://docs.rs/reqwest-eventsource/latest/reqwest_eventsource/) and friends are not used in our final binary, let's add them in `dev-dependencies` in `Cargo.toml`.

```toml
[dev-dependencies]
reqwest = { version = "0.11.22", features = ["json", "stream", "multipart"] }
reqwest-eventsource = "0.5.0"
eventsource-stream = "0.2.3"
```

Add the dummy handler, and axum's router to route requests to `POST /v1/engines/:engine/completions`
```rust
use axum::{routing::post, Router};

async fn completion() -> &'static str {
    "Hello, World!"
}

fn app() -> Router {
    Router::new()
        .route("/v1/engines/:engine/completions", post(completion))
}
```

Translate the spec into the test:
```rust
#[cfg(test)]
mod tests {
    // imports are only for the tests
    // ...

    /// `super::*` means "everything in the parent module"
    /// It will bring all of the test module’s parent’s items into scope.
    use super::*;
    /// A helper function that spawns our application in the background
    /// and returns its address (e.g. http://127.0.0.1:[random_port])
    async fn spawn_app(host: impl Into<String>) -> String {
        let _host = host.into();
        // Bind to localhost at the port 0, which will let the OS assign an available port to us
        let listener = TcpListener::bind(format!("{}:0", _host)).await.unwrap();
        // We retrieve the port assigned to us by the OS
        let port = listener.local_addr().unwrap().port();

        let _ = tokio::spawn(async move {
            let app = app();
            axum::serve(listener, app).await.unwrap();
        });

        // We return the application address to the caller!
        format!("http://{}:{}", _host, port)
    }

    /// The #[tokio::test] annotation on the test_sse_engine_completion function is a macro.
    /// Similar to #[tokio::main] It transforms the async fn test_sse_engine_completion()
    /// into a synchronous fn test_sse_engine_completion() that initializes a runtime instance
    /// and executes the async main function.
    #[tokio::test]
    async fn test_sse_engine_completion() {
        let listening_url = spawn_app("127.0.0.1").await;
        let mut completions: Vec<Completion> = vec![];
        let model_name = "code-llama-7b";
        let body = serde_json::json!({ ... });

        let time_before_request = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let mut stream = reqwest::Client::new()
            .post(&format!(
                "{}/v1/engines/{engine}/completions",
                listening_url,
                engine = model_name
            ))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .unwrap()
            .bytes_stream()
            .eventsource();

        // iterate over the stream of events
        // and collect them into a vector of Completion objects
        while let Some(event) = stream.next().await {
            match event {
                Ok(event) => {
                    // break the loop at the end of SSE stream
                    if event.data == "[DONE]" {
                        break;
                    }
                    
                    // parse the event data into a Completion object
                    let completion = serde_json::from_str::<Completion>(&event.data).unwrap();
                    completions.push(completion);
                }
                Err(_) => {
                    panic!("Error in event stream");
                }
            }
        }
        // The endpoint should return at least one completion object
        assert!(completions.len() > 0);

        // Check that each completion object has the correct fields
        // note that we didn't check all the values of the fields because
        // `serde_json::from_str::<Completion>` should panic if the field 
        // is missing or in unexpected format
        for completion in completions {
            // id should be a non-empty string
            assert!(completion.id.len() > 0);
            assert!(completion.object == "text_completion");
            assert!(completion.created >= time_before_request);
            assert!(completion.model == model_name);

            // each completion object should have at least one choice
            assert!(completion.choices.len() > 0);

            // check that each choice has a non-empty text
            for choice in completion.choices {
                assert!(choice.text.len() > 0);
                // finish_reason should can be None or Some(String)
                match choice.finish_reason {
                    Some(finish_reason) => {
                        assert!(finish_reason.len() > 0);
                    }
                    None => {}
                }
            }

            assert!(completion.system_fingerprint == "");
        }
    }
}
```

Run the tests by `cargo test`, the tests failed, because we haven't implemented the  `completion()`

Add the endpoint, to pass the tests, the endpoint need to response with chucks of SSE struct, let's first fake the values in the struct first, we will connect the endpoint to llm later! It's important to stabilise the HTTP interface first.
```rust
use async_stream::stream;
use axum::response::sse::{Event as SseEvent, KeepAlive, Sse};
use axum::Json;
use futures::stream::Stream;
use oxpilot::types::{Choice, Completion, CompletionRequest, Usage};
use serde_json::{json, to_string};
use std::convert::Infallible;
use std::time::{SystemTime, UNIX_EPOCH};

// Reference: https://github.com/tokio-rs/axum/blob/main/examples/sse/src/main.rs
pub async fn completion(
    // `Json<T>` will automatically deserialize the request body to a type `T` as JSON.
    Json(body): Json<CompletionRequest>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    // `stream!` is a macro from [`async_stream`](https://docs.rs/async-stream/0.3.5/async_stream/index.html) 
    // that makes it easy to create a `futures::stream::Stream` from a generator.
    Sse::new(stream! {
        yield Ok(
          // Create a new `SseEvent` with the default settings.
          // `SseEvent::default().data("Hello, World!")` will return `data: Hello, World!` as the event text chuck.
          SseEvent::default().data(
            // Serialize the `Completion` struct to JSON and return it as the event text chunk.
            to_string(
              // json! is a macro from serde_json that makes it easy to create JSON values from a struct.
              &json!(
                Completion {
                  id: "cmpl-".to_string(),
                  object: "text_completion".to_string(),
                  created: SystemTime::now()
                      .duration_since(UNIX_EPOCH)
                      .unwrap()
                      .as_secs(),
                  model: body.model.unwrap_or("unknown".to_string()),
                  choices: vec![Choice {
                      text: " world!".to_string(),
                      index: 0,
                      logprobs: None,
                      finish_reason: Some("stop".to_string()),
                  }],
                  usage: Usage {
                      prompt_tokens: 0,
                      completion_tokens: 0,
                      total_tokens: 0
                  },
                  system_fingerprint: "".to_string(),
                }
              )).unwrap()
            )
        );
    })
    .keep_alive(KeepAlive::default())
}
```
That's it,  the tests should pass now.
```shell
running 1 test
test tests::test_sse_engine_completion ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s
```

Alternatively, we can test the copilot e2e:
```shell
cargo run
```
will bind the server at port `6666`, because we have these in `main`:
```rust
#[tokio::main]
async fn main() {
    // ..
    let listener = tokio::net::TcpListener::bind("0.0.0.0:6666").await.unwrap();
    let app = app();
    axum::serve(listener, app).await.unwrap();
}
```

Edit the `settings.json` in VSCode.
```json
"github.copilot.advanced": {
   "debug.overrideProxyUrl": "http://localhost:6666"
}
```

And open any file, we should see ghost texts with ` world!` that is from our copilot server running at port `6666`.
<p align="center">
<img width="200" alt="The editor showing the completion as ghost text" src="/blog/images/i-made-a-copilot-in-rust/ghost-text-1.png">
</p>
<p align="center">
<img width="200" alt="The completed ghost text in the editor" src="/blog/images/i-made-a-copilot-in-rust/ghost-text-2.png">
</p>


### Builder Pattern <a id="builder"></a>

In this section, we will implement a new [`struct`](https://doc.rust-lang.org/book/ch05-01-defining-structs.html) (like an `Object`), `LLMBuilder` in `llm.rs`, and use the `struct` in our binary's entry point `main.rs`.

To be able to use components from `llm.rs` in `main.rs` we layout our files like
```
└── src
    ├── lib.rs
    ├── llm.rs
    └── main.rs
```
in `llm.rs`, we make `LLMBuilder` public.
```rust
// llm.rs
pub struct LLMBuilder {}
```
Declare new module ([mod](https://doc.rust-lang.org/stable/reference/items/modules.html)) in `lib.rs`)
```rust
// lib.rs
pub mod llm; // rust will resolve to `./llm.rs`
```
and use the module in `main.rs`
```rust
use oxpilot::llm::LLMBuilder;
fn main() {
  // 
}
```

`LLMBuilder` is implemented using a design pattern "[Builder](https://www.youtube.com/watch?v=Z_3WOSiYYFY)", which is a _creational_ pattern that lets you construct complex objects steps-by-steps.

The end result is
```rust
let llm_builder = LLMBuilder::new()
        .tokenizer_repo_id("hf-internal-testing/llama-tokenizer")
        .model_repo_id("TheBloke/CodeLlama-7B-GGU")
        .model_file_name("codellama-7b.Q2_K.gguf");
let llm = llm_builder.build().await;
```

#### **_Constructor_** `::default()` v.s. `::new()` <a id="default_vs_new"></a>

Rust does not have constructor for `struct` to assign values to fields in `struct` when creating new instances, it's common to use [associated-functions](https://doc.rust-lang.org/stable/book/ch05-03-method-syntax.html#associated-functions) `::new()` for the same purpose. Another option is to use [`Default`](https://doc.rust-lang.org/std/default/trait.Default.html) trait to implement "Constructor". 

We implement [`Default`](https://doc.rust-lang.org/std/default/trait.Default.html) trait for `LLMBuilder` and implement `new()` for the user who prefer `::new()` pattern.

```rust
impl LLMBuilder {
    pub fn new() -> Self {
        Self::default()
    }
};
LLMBuilder::new(); // same as `LLMBuilder::default()`
```

#### `impl Into<String>` for function parameter <a id="into_string"></a>

To make the functions in our `struct` friendly for user, we use `impl Into<String>` tricks to allow passing both `String` and `&str` as function parameters.

```rust
impl LLMBuilder {
  pub fn tokenizer_repo_id(mut self, param: impl Into<String>) {}
}
// both are accepted
LLMBuilder::new().tokenizer_repo_id("string_slice");
LLMBuilder::new().tokenizer_repo_id(String::from("String"));
```

### Type State <a id="typestate"></a>

In previous section, we implement the builder for `LLM`, that is great, we can construct `LLM` with the descriptive chain of methods.
```rust
let llm_builder = LLMBuilder::new()
    .tokenizer_repo_id("repo")
    .model_repo_id("repo")
    .model_file_name("file");
let llm = llm_builder.build().await;
``` 

However, let's step aside, and be in the shoes the users, if a user tries to use  `LLMBuilder`, it's possible that they forgot to support mandatory parameter, for example, one may forget to chain `model_repo_id()`:

```rust
let llm_builder = LLMBuilder::new()
    .model_file_name("file");
``` 

This is **acceptable**. unlike other language which designed to throws exceptions in runtime, Rust's [`Result`](https://doc.rust-lang.org/std/result/) will propagate error back to user. As a result, there won't be runtime exceptions if the user deal with the [`Result`](https://doc.rust-lang.org/std/result/) properly at compile time:

```rust
let llm_builder = LLMBuilder::new()
    .model_file_name("file");
let llm = match llm_builder.await {
    Ok(llm) => llm,
    Err(error) => {
        // handle the error properly here
    }
};
```
However, what if we can improve the DX, to make the developer knows the problem as soon as possible, to make the feedback loop shorter, ideally when writing the code, i.e., compile time error?

**_Type State_** is a pattern that specify the state in type, and make compiler checks the state before running the code.

Our goal is to make compiler warn us, when mandatory parameters for creation of `LLM` is missing, for example, this will failed to compile:
```rust
let llm_builder = LLMBuilder::new();
let llm = lllm_builder.build().await;
``` 
The compiler will tell the user that, hey, the `build()` can't be used yet, you should not pass!
<p align="center">
<img width="600" alt="Compiler error: build() is not available yet" src="/blog/images/i-made-a-copilot-in-rust/build-not-available.png">
</p>
and the code intelligent in the editor will support that, hey, there is `tokenizer_repo_id()` method available, would you want to try first?  
<p align="center">
<img width="600" alt="The editor suggesting the tokenizer_repo_id() method" src="/blog/images/i-made-a-copilot-in-rust/tokenizer-suggestion.png">
</p>

We can help our user, to find the next steps by defining the type state

```rust
// Init state when `::new()` is called.
pub struct InitState;

// Intermediate state, with token repo id, ready to accept model repo id
pub struct WithTokenizerRepoId;
```

And, move the implementation to where have the correct state, at the beginning, the state is `InitState`, and user can only use `new()` (does not change state), and `tokenizer_repo_id()`, which will return the instance with `State=WithTokenizerRepoId`.

```rust
impl LLMBuilder<InitState> {
    pub fn new() -> Self {
        LLMBuilder {
           ...
            // does not change state
            state: InitState,
        }
    }
    pub fn tokenizer_repo_id(
        self,
        tokenizer_repo_id: impl Into<String>,
    ) -> LLMBuilder<WithTokenizerRepoId> {
        LLMBuilder {
            ...
            // change state to `WithTokenizerRepoId`
            state: WithTokenizerRepoId,
        }
    }
}
```
If we inspect the builder instance, we will notice that it has `WithTokenizerRepoId` state.
<p align="center">
<img width="500" alt="The builder inspected in the editor, in the WithTokenizerRepoId state" src="/blog/images/i-made-a-copilot-in-rust/with-tokenizer-state.png">
</p>
That's great! Let's `impl` to builder with `WithTokenizerRepoId` state, so user will know what to do next.

With `tokenizer_repo_id` in place, the next is to set `model_repo_id`, calling `model_repo_id()` will set `model_repo_id` and return `LLMBuilder<WithModelRepoId>`
```rust
// Intermediate state, with model repo id, ready to accept model file name
pub struct WithModelRepoId;

impl LLMBuilder<WithTokenizerRepoId> {
    pub fn model_repo_id(self, model_repo_id: impl Into<String>) -> LLMBuilder<WithModelRepoId> {
        LLMBuilder {
            ...
           // change state to `WithModelRepoId`
            state: WithModelRepoId,
        }
    }
}
```

We are almost ready, the final step is to assign `model_file_name`, then the builder is ready to build.
```rust
/// With both token repo id and model repo id
pub struct ReadyState;

impl LLMBuilder<WithModelRepoId> {
    pub fn model_file_name(self, model_file_name: impl Into<String>) -> LLMBuilder<ReadyState> {
        LLMBuilder {
            ...
           // change state to `WithModelRepoId`
            state: ReadyState,
        }
    }
}
```
Implement the `LLMBuilder<ReadyState>` which adds the `build()` method.
```rust
impl LLMBuilder<ReadyState> {
    pub async fn build(self) -> Result<LLM> { ... }
}
```
That's it. We have improved our builder. The compiler will emit errors when any of mandatory parameters are missing, and avoid the runtime exceptions.

The final result
```rust
let _ = LLMBuilder::new()
    // mandatory parameters, without these compiler warns
    .tokenizer_repo_id("string_slice")
    .model_repo_id("repo")
    .model_file_name("model.file");
```

Inspect the builder, it has `ReadyState`!
<p align="center">
<img width="500" alt="The builder inspected in the editor, in the ReadyState" src="/blog/images/i-made-a-copilot-in-rust/ready-state.png">
</p>

### Share Memory `Arc<Mutex<_>>` <a id="arc_mutex_share"></a>
### Share Memory by Communicating: **Actor** <a id="actor"></a>
